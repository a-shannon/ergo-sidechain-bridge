import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import blakejs from 'blakejs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  reserveFederatedNativeReservationAttemptV1 as reserve, submitFederatedNativeReservationV1 as submit,
  sealFederatedNativeReservationV1 as seal, observeFederatedNativeReservationInclusionV1 as observe,
} from './federated-native-reservation-execution-v1.js';

const GENESIS = `0x${'11'.repeat(32)}`;
const BLOCK = `0x${'22'.repeat(32)}`;
const PRIMARY = 'http://127.0.0.1:19955';
const WITNESS = 'http://127.0.0.1:19956';
const ACCOUNT = `0x${'33'.repeat(68)}`;
const EXTRINSIC = `0x${'44'.repeat(128)}`;
const HASH = `0x${Buffer.from(blakejs.blake2b(Buffer.from(EXTRINSIC.slice(2), 'hex'), undefined, 32)).toString('hex')}`;
let directory: string;
let included: boolean;
let submitted: boolean;
let calls: Array<{ url: string; method: string; params: unknown[] }>;
let fault: ((url: string, method: string, params: unknown[], value: unknown) => unknown) | undefined;
let storage: Record<string, string | null>;
let originalAccount: string;
let account: string;
let header: object;
let extrinsics: string[];
const candidate = { genesisHashHex: GENESIS, extrinsicHashHex: HASH, signedExtrinsicHex: EXTRINSIC };
let authorize: ReturnType<typeof vi.fn>;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'bridge-native-attempt-test-'));
  included = false; submitted = false; calls = []; fault = undefined;
  storage = { '0x01': '0x01', '0x02': '0x02', '0x03': '0x03', '0x04': '0x04', '0x05': null, '0x06': null, '0x07': null };
  const bytes = Buffer.alloc(80); bytes.writeUInt32LE(1, 8); bytes.writeBigUInt64LE(1000n, 16);
  originalAccount = `0x${bytes.toString('hex')}`;
  bytes.writeUInt32LE(1, 0); bytes.writeBigUInt64LE(900n, 16);
  account = `0x${bytes.toString('hex')}`;
  header = { parentHash: GENESIS, number: '0x1', stateRoot: `0x${'55'.repeat(32)}`,
    extrinsicsRoot: `0x${'66'.repeat(32)}`, digest: { logs: [] } };
  extrinsics = ['0x1005010028', EXTRINSIC];
  authorize = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    expect([PRIMARY, WITNESS]).toContain(url); expect(init.redirect).toBe('error'); expect(init.method).toBe('POST');
    const { method, params } = JSON.parse(init.body as string);
    calls.push({ url, method, params });
    let result: unknown;
    if (method === 'author_submitExtrinsic') {
      expect(url).toBe(PRIMARY); expect(params).toEqual([EXTRINSIC]);
      expect(JSON.parse(readFileSync(join(directory, 'native-reservation-attempt.json'), 'utf8')))
        .toMatchObject({ status: 'reserved', ...candidate });
      expect(authorize).toHaveBeenCalled(); submitted = true; result = HASH;
    } else if (method === 'engine_createBlock') {
      expect(url).toBe(PRIMARY); expect(params).toEqual([false, false, GENESIS]);
      included = true; result = { hash: BLOCK, aux: { isNewBest: true } };
    } else if (method === 'chain_getBlockHash') result = params[0] === 0 ? GENESIS : included ? BLOCK : null;
    else if (method === 'chain_getHeader') result = included ? header : { number: '0x0' };
    else if (method === 'author_pendingExtrinsics') result = submitted && !included ? [EXTRINSIC] : [];
    else if (method === 'chain_getBlock') {
      expect(params).toEqual([BLOCK]); result = { block: { header: structuredClone(header), extrinsics: [...extrinsics] }, justifications: null };
    } else if (method === 'state_getStorage') {
      expect(params[1]).toBe(BLOCK); result = params[0] === ACCOUNT ? account : storage[params[0]] ?? null;
    } else throw new Error('unexpected native RPC');
    if (fault) result = fault(url, method, params, result);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
  }));
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (!resolve(directory).startsWith(`${resolve(tmpdir())}${sep}bridge-native-attempt-test-`)) throw new Error('unexpected fixture cleanup path');
  rmSync(directory, { recursive: true, force: true });
});

async function sealed() {
  const attempt = reserve(directory, candidate);
  await submit(attempt, authorize);
  const blockHashHex = await seal(attempt, authorize);
  return { attempt, blockHashHex, expectedStorage: { ...storage }, operatorStorageKeyHex: ACCOUNT, originalOperatorAccountHex: originalAccount };
}

describe('fixed local native reservation execution', () => {
  it('persists before one submission, seals without finalization and observes exact paired state', async () => {
    const input = await sealed();
    expect(await observe(input, authorize)).toEqual({ blockHashHex: BLOCK, blockHeight: 1, extrinsicIndex: 1,
      extrinsicHashHex: HASH, sourceFinalityEstablished: false, mintAuthorized: false });
    expect(calls.filter(call => call.method === 'author_submitExtrinsic')).toHaveLength(1);
    expect(calls.filter(call => call.method === 'engine_createBlock')).toHaveLength(1);
    for (const url of [PRIMARY, WITNESS]) expect(calls.filter(call => call.url === url && call.method === 'state_getStorage'))
      .toHaveLength(Object.keys(storage).length + 1);
    await expect(submit(input.attempt, authorize)).rejects.toThrow(/consumed/);
    await expect(seal(input.attempt, authorize)).rejects.toThrow(/not available/);
    expect(() => reserve(directory, candidate)).toThrow(/EEXIST/);
  });

  it.each(['hash', 'bytes', 'extra', 'accessor', 'zero genesis', 'relative directory', 'file directory'])
    ('rejects attempt %s before transport', faultName => {
      const changed: any = { ...candidate };
      let selected = directory;
      if (faultName === 'hash') changed.extrinsicHashHex = BLOCK;
      if (faultName === 'bytes') changed.signedExtrinsicHex += '00';
      if (faultName === 'extra') changed.verified = true;
      if (faultName === 'accessor') Object.defineProperty(changed, 'signedExtrinsicHex', { enumerable: true,
        get() { throw new Error('getter should not execute'); } });
      if (faultName === 'zero genesis') changed.genesisHashHex = `0x${'00'.repeat(32)}`;
      if (faultName === 'relative directory') selected = '.';
      if (faultName === 'file directory') { selected = join(directory, 'ordinary-file'); writeFileSync(selected, 'fixture'); }
      expect(() => reserve(selected, changed)).toThrow(/different extrinsic|own-data|malformed|direct existing/);
      expect(calls).toHaveLength(0);
    });

  it.each(['clone', 'hold altered', 'authorization rejected'])('rejects %s at submission', async faultName => {
    let attempt = reserve(directory, candidate);
    if (faultName === 'clone') attempt = { ...attempt };
    if (faultName === 'hold altered') writeFileSync(join(directory, 'native-reservation-attempt.json'), 'changed');
    if (faultName === 'authorization rejected') authorize.mockImplementation(() => { throw new Error('authorization rejected'); });
    await expect(submit(attempt, authorize)).rejects.toThrow(/not original|durable hold|authorization rejected/);
    expect(calls).toHaveLength(0);
  });

  it.each(['lost response', 'wrong hash', 'RPC error', 'duplicate JSON', 'wrong id', 'invalid UTF8', 'HTTP error'])
    ('holds ambiguous submission after %s without retry or seal', async faultName => {
      const attempt = reserve(directory, candidate);
      vi.stubGlobal('fetch', vi.fn(async () => {
        if (faultName === 'lost response') throw new Error('lost response');
        if (faultName === 'HTTP error') return new Response('{}', { status: 400 });
        if (faultName === 'invalid UTF8') return new Response(new Uint8Array([0xff]));
        if (faultName === 'duplicate JSON') return new Response(`{"jsonrpc":"2.0","id":1,"id":1,"result":"${HASH}"}`);
        return new Response(JSON.stringify(faultName === 'RPC error' ? { jsonrpc: '2.0', id: 1, error: { code: -1 } }
          : { jsonrpc: '2.0', id: faultName === 'wrong id' ? 2 : 1, result: faultName === 'wrong hash' ? BLOCK : HASH }));
      }));
      await expect(submit(attempt, authorize)).rejects.toThrow();
      await expect(submit(attempt, authorize)).rejects.toThrow(/consumed/);
      await expect(seal(attempt, authorize)).rejects.toThrow(/not available/);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(() => reserve(directory, candidate)).toThrow(/EEXIST/);
    });

  it.each(['primary parent', 'witness parent', 'height', 'primary pool absent', 'foreign pool', 'duplicate pool'])
    ('rejects %s before sealing', async faultName => {
      const attempt = reserve(directory, candidate); await submit(attempt, authorize);
      fault = (url, method, _params, result) => {
        if (method === 'chain_getBlockHash' && faultName === `${url === PRIMARY ? 'primary' : 'witness'} parent`) return BLOCK;
        if (method === 'chain_getHeader' && faultName === 'height') return { number: '0x1' };
        if (method === 'author_pendingExtrinsics') {
          if (faultName === 'primary pool absent' && url === PRIMARY) return [];
          if (faultName === 'foreign pool') return ['0x01'];
          if (faultName === 'duplicate pool') return [EXTRINSIC, EXTRINSIC];
        }
        return result;
      };
      await expect(seal(attempt, authorize)).rejects.toThrow(/parent changed|pool is not exclusive/);
      expect(calls.some(call => call.method === 'engine_createBlock')).toBe(false);
    });

  it.each(['missing call', 'duplicate call', 'reordered call', 'other signed call', 'wrong timestamp',
    'parent', 'height', 'state root', 'digest', 'state', 'nonce', 'funding increase', 'unfunded', 'account disagreement',
    'block disagreement', 'canonical replacement', 'advanced tip', 'pending pool', 'wrong selected block', 'disposed custody'])
    ('withholds inclusion for %s', async faultName => {
      const input = await sealed();
      if (faultName === 'missing call') extrinsics = [extrinsics[0]!];
      if (faultName === 'duplicate call') extrinsics = [extrinsics[0]!, EXTRINSIC, EXTRINSIC];
      if (faultName === 'reordered call') extrinsics.reverse();
      if (faultName === 'other signed call') extrinsics[1] = `0x${'45'.repeat(128)}`;
      if (faultName === 'wrong timestamp') extrinsics[0] = '0x1004020028';
      if (faultName === 'parent') Object.assign(header, { parentHash: BLOCK });
      if (faultName === 'height') Object.assign(header, { number: '0x2' });
      if (faultName === 'state root') Object.assign(header, { stateRoot: '0x01' });
      if (faultName === 'digest') Object.assign(header, { digest: { logs: ['bad'] } });
      if (faultName === 'state') storage['0x04'] = '0xfe';
      if (['nonce', 'funding increase', 'unfunded'].includes(faultName)) {
        const bytes = Buffer.from(account.slice(2), 'hex');
        if (faultName === 'nonce') bytes.writeUInt32LE(2, 0);
        else bytes.writeBigUInt64LE(faultName === 'unfunded' ? 0n : 1001n, 16);
        account = `0x${bytes.toString('hex')}`;
      }
      if (faultName === 'wrong selected block') input.blockHashHex = GENESIS;
      if (faultName === 'disposed custody') authorize.mockImplementation(() => { throw new Error('custody disposed'); });
      fault = (url, method, params, result) => {
        if (faultName === 'block disagreement' && url === WITNESS && method === 'chain_getBlock') {
          const changed = structuredClone(result) as any; changed.block.header.stateRoot = BLOCK; return changed;
        }
        if (faultName === 'account disagreement' && url === WITNESS && method === 'state_getStorage' && params[0] === ACCOUNT) {
          const bytes = Buffer.from(account.slice(2), 'hex'); bytes.writeBigUInt64LE(899n, 16); return `0x${bytes.toString('hex')}`;
        }
        if (faultName === 'canonical replacement' && method === 'chain_getBlockHash' && params[0] === 1) return GENESIS;
        if (faultName === 'advanced tip' && method === 'chain_getBlockHash' && params.length === 0) return GENESIS;
        if (faultName === 'pending pool' && method === 'author_pendingExtrinsics') return [EXTRINSIC];
        return result;
      };
      await expect(observe(input, authorize)).rejects.toThrow(/exclusive call|header differs|malformed|state differs|nonce or funding|disagrees|disagree|absent or divergent|target changed|not sealed|custody disposed/);
      expect(calls.filter(call => call.method === 'author_submitExtrinsic')).toHaveLength(1);
      expect(calls.filter(call => call.method === 'engine_createBlock')).toHaveLength(1);
    });

  it('waits only for witness propagation without another submission', async () => {
    const input = await sealed(); let observations = 0;
    fault = (url, method, params, result) => url === WITNESS && method === 'chain_getBlockHash'
      && params[0] === 1 && observations++ === 0 ? null : result;
    expect((await observe(input, authorize)).blockHashHex).toBe(BLOCK);
    expect(calls.filter(call => call.method === 'author_submitExtrinsic')).toHaveLength(1);
  });

  it.each(['04', '84', '85', '06'])('rejects non-producer timestamp preamble %s', async preamble => {
    const input = await sealed();
    extrinsics[0] = `0x10${preamble}010028`;
    await expect(observe(input, authorize)).rejects.toThrow(/exact exclusive call/);
  });

  it.each(['fc', '0101', 'fdff', '02000100', 'feffffff', '0300000040', '0b0068e5cf8b01', '13ffffffffffffffff'])
    ('accepts canonical timestamp compact bytes %s', async compact => {
      const input = await sealed();
      const body = Buffer.from(`050100${compact}`, 'hex');
      extrinsics[0] = `0x${Buffer.concat([Buffer.from([body.length * 4]), body]).toString('hex')}`;
      expect((await observe(input, authorize)).blockHashHex).toBe(BLOCK);
    });

  it.each(['00', '01', 'fd00', '0200', 'feff0000', '03000000', '03ffffff3f', '070000004000',
    '17ffffffffffffffffff', '010100', '030000004000'])
    ('rejects truncated, nonminimal or oversized timestamp %s at inclusion', async compact => {
      const input = await sealed();
      const body = Buffer.from(`050100${compact}`, 'hex');
      extrinsics[0] = `0x${Buffer.concat([Buffer.from([body.length * 4]), body]).toString('hex')}`;
      await expect(observe(input, authorize)).rejects.toThrow(/exact exclusive call/);
    });

  it('consumes the transport slot before an overlapping submission can start', async () => {
    const attempt = reserve(directory, candidate);
    let release!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { release = done; })));
    const first = submit(attempt, authorize);
    await expect(submit(attempt, authorize)).rejects.toThrow(/consumed/);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(authorize).toHaveBeenCalledTimes(1);
    release(new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: HASH })));
    await first;
  });

  it('retains the durable hold across a cold module restart without reconstructing authority', async () => {
    const attempt = reserve(directory, candidate);
    vi.resetModules();
    const restarted = await import('./federated-native-reservation-execution-v1.js');
    expect(() => restarted.reserveFederatedNativeReservationAttemptV1(directory, candidate)).toThrow(/EEXIST/);
    await expect(restarted.submitFederatedNativeReservationV1(attempt, authorize)).rejects.toThrow(/not original/);
    await expect(restarted.submitFederatedNativeReservationV1({ ...attempt }, authorize)).rejects.toThrow(/not original/);
    expect(calls).toHaveLength(0);
    expect(authorize).not.toHaveBeenCalled();
  });
});
