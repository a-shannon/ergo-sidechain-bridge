import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeFederatedGenesisReservationTargetV1 as observe } from './federated-genesis-target-observation-v1.js';

const PRIMARY = 'http://127.0.0.1:19955';
const WITNESS = 'http://127.0.0.1:19956';
const GENESIS = `0x${'12'.repeat(32)}`;
const PROFILE = '0xaf86fef4216ac2bcd1c592b204011ad0710f901342def5945398fc0e02473bde';
const ENFORCEMENT = '0xaf86fef4216ac2bcd1c592b204011ad04e000f8baeaa137cf901a9235d7de9a1';
const SUDO = '0x5c0d1176a568c1f92944340dbfed9e9c530ebca703c85910e7164cb7d1c9e47b';
const ACCOUNT = `0x${'45'.repeat(68)}`;
let input: Parameters<typeof observe>[0];
let fixture: Record<string, string>;
let calls: Array<{ url: string; method: string; params: unknown[] }>;
let fault: ((url: string, method: string, params: unknown[], result: unknown) => unknown) | undefined;

beforeEach(() => {
  const code = Buffer.from('0061736d01000000', 'hex');
  const account = Buffer.alloc(80); account.writeUInt32LE(1, 8); account.writeBigUInt64LE(1000n, 16);
  fixture = { '0x3a636f6465': `0x${code.toString('hex')}`, [PROFILE]: `0x${'34'.repeat(349)}`,
    [ENFORCEMENT]: '0x01', [ACCOUNT]: `0x${account.toString('hex')}` };
  input = { expectedStorage: { ...fixture }, expectedGenesisHashHex: GENESIS,
    sourceRuntimeCodeSha256Hex: createHash('sha256').update(code).digest('hex'), sourceRuntimeCodeBytes: code.length,
    runtimeProfileScaleHex: fixture[PROFILE]!, operatorStorageKeyHex: ACCOUNT, operatorAccountInfoHex: fixture[ACCOUNT]! };
  calls = []; fault = undefined;
  const observedGenesis = new Map<string, unknown>();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    expect([PRIMARY, WITNESS]).toContain(url);
    expect(init.method).toBe('POST'); expect(init.redirect).toBe('error');
    const { method, params } = JSON.parse(init.body as string);
    calls.push({ url, method, params });
    let result: unknown;
    if (method === 'chain_getBlockHash') { expect(params).toEqual([0]); result = GENESIS; }
    else if (method === 'chain_getHeader') { expect([[], [observedGenesis.get(url)]]).toContainEqual(params); result = { number: '0x0' }; }
    else if (method === 'state_getStorage') { expect(params[1]).toBe(observedGenesis.get(url)); result = fixture[params[0]] ?? null; }
    else if (method === 'author_pendingExtrinsics') { expect(params).toEqual([]); result = []; }
    else throw new Error('unexpected RPC');
    if (fault) result = fault(url, method, params, result);
    if (method === 'chain_getBlockHash') observedGenesis.set(url, result);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('FED native reservation target observation', () => {
  it('reads both height-zero runtimes, profiles, empty pools and the exact funded account', async () => {
    expect(await observe(input)).toEqual({ genesisHashHex: GENESIS, nonce: 0 });
    for (const url of [PRIMARY, WITNESS]) {
      expect(calls.filter(call => call.url === url && call.method === 'state_getStorage').map(call => call.params))
        .toEqual([...Object.keys(fixture), SUDO].map(key => [key, GENESIS]));
      expect(calls.filter(call => call.url === url && call.method === 'author_pendingExtrinsics')).toHaveLength(2);
    }
  });

  it.each(['runtime digest', 'runtime size', 'runtime bytes', 'profile', 'enforcement', 'account key',
    'account bytes', 'nonce', 'unfunded', 'genesis zero', 'extra', 'accessor', 'symbol', 'storage accessor', 'storage prototype', 'coercion'])
    ('rejects %s before RPC', async defect => {
      const changed: any = { ...input, expectedStorage: { ...input.expectedStorage } };
      if (defect === 'runtime digest') changed.sourceRuntimeCodeSha256Hex = 'ff'.repeat(32);
      if (defect === 'runtime size') changed.sourceRuntimeCodeBytes++;
      if (defect === 'runtime bytes') changed.expectedStorage['0x3a636f6465'] = '0x0061736d01000001';
      if (defect === 'profile') changed.expectedStorage[PROFILE] = `0x${'35'.repeat(349)}`;
      if (defect === 'enforcement') changed.expectedStorage[ENFORCEMENT] = '0x00';
      if (defect === 'account key') changed.operatorStorageKeyHex = `0x${'46'.repeat(68)}`;
      if (defect === 'account bytes') changed.expectedStorage[ACCOUNT] = '0x00';
      if (defect === 'nonce' || defect === 'unfunded') {
        const account = Buffer.from(input.operatorAccountInfoHex.slice(2), 'hex');
        if (defect === 'nonce') account.writeUInt32LE(1, 0); else account.fill(0, 16, 32);
        changed.operatorAccountInfoHex = changed.expectedStorage[ACCOUNT] = `0x${account.toString('hex')}`;
      }
      if (defect === 'genesis zero') changed.expectedGenesisHashHex = `0x${'00'.repeat(32)}`;
      if (defect === 'extra') changed.verified = true;
      if (defect === 'accessor') Object.defineProperty(changed, 'expectedGenesisHashHex', { enumerable: true,
        get() { throw new Error('getter executed'); } });
      if (defect === 'symbol') changed[Symbol('unexpected')] = 1;
      if (defect === 'storage accessor') Object.defineProperty(changed.expectedStorage, ACCOUNT, { enumerable: true,
        get() { throw new Error('getter executed'); } });
      if (defect === 'storage prototype') Object.setPrototypeOf(changed.expectedStorage, { inherited: true });
      if (defect === 'coercion') changed.expectedGenesisHashHex = { toString() { throw new Error('coercion executed'); } };
      await expect(observe(changed)).rejects.toThrow(/own-data|differs|unused funded|bounded exact/);
      expect(calls).toHaveLength(0);
    });

  it.each([PRIMARY, WITNESS])('rejects mismatched node state at %s', async origin => {
    fault = (url, method, params, result) => url === origin && method === 'state_getStorage' && params[0] === ACCOUNT
      ? '0x00' : result;
    await expect(observe(input)).rejects.toThrow(/storage differs/);
  });

  it.each(['runtime', 'profile', 'enforcement', 'sudo', 'pool', 'header', 'genesis', 'genesis disagreement'])
    ('rejects observed %s drift', async defect => {
      fault = (url, method, params, result) => {
        if (method === 'state_getStorage' && params[0] === ({ runtime: '0x3a636f6465', profile: PROFILE,
          enforcement: ENFORCEMENT, sudo: SUDO } as Record<string, string>)[defect]) return '0x00';
        if (defect === 'pool' && method === 'author_pendingExtrinsics') return ['0x01'];
        if (defect === 'header' && method === 'chain_getHeader') return { number: '0x1' };
        if (method === 'chain_getBlockHash' && (defect === 'genesis'
          || defect === 'genesis disagreement' && url === WITNESS)) return `0x${'13'.repeat(32)}`;
        return result;
      };
      const expected = ['runtime', 'profile', 'enforcement', 'sudo'].includes(defect) ? /storage differs/
        : defect === 'pool' ? /pool is not empty/ : defect === 'header' ? /no longer at genesis/
          : defect === 'genesis' ? /genesis differs/ : /nodes disagree/;
      await expect(observe(input)).rejects.toThrow(expected);
    });

  it.each(['pool', 'tip', 'genesis'])('rejects primary %s drift while the witness was observed', async defect => {
    let witnessSeen = false;
    fault = (url, method, _params, result) => {
      if (url === WITNESS) witnessSeen = true;
      if (url === PRIMARY && witnessSeen) {
        if (defect === 'pool' && method === 'author_pendingExtrinsics') return ['0x01'];
        if (defect === 'tip' && method === 'chain_getHeader') return { number: '0x1' };
        if (defect === 'genesis' && method === 'chain_getBlockHash') return `0x${'13'.repeat(32)}`;
      }
      return result;
    };
    await expect(observe(input)).rejects.toThrow(/changed before signing/);
  });

  it('compares against the expected genesis before signing', async () => {
    await expect(observe({ ...input, expectedGenesisHashHex: `0x${'13'.repeat(32)}` })).rejects.toThrow(/genesis differs/);
  });

  it('captures the expected storage before asynchronous observation', async () => {
    fault = (_url, _method, _params, result) => {
      (input.expectedStorage as Record<string, string>)[ACCOUNT] = '0x00';
      return result;
    };
    expect(await observe(input)).toEqual({ genesisHashHex: GENESIS, nonce: 0 });
  });
});
