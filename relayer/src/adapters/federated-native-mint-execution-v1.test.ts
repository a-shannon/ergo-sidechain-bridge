import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { Interface } from 'ethers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFederatedGenesisOperatorV1, disposeFederatedGenesisOperatorV1,
  signFederatedGenesisReservationV1, signFederatedGenesisMintV1 } from './federated-genesis-operator-v1.js';
import { encodeFederatedNativeMintExtrinsicV1Hex } from '../federated-native-mint-runtime-state-v1.js';
import { reserveFederatedNativeReservationAttemptV1, submitFederatedNativeReservationV1,
  sealFederatedNativeReservationV1, observeFederatedNativeMintParentV1, reserveFederatedNativeMintAttemptV1,
  submitFederatedNativeMintV1, sealFederatedNativeMintV1, observeFederatedNativeMintInclusionV1,
  observeFederatedNativeMintStateV1, type FederatedNativeMintContextV1 } from './federated-native-reservation-execution-v1.js';

const hash = (byte: string) => `0x${byte.repeat(32)}`;
const GENESIS = hash('11'), PARENT = hash('22'), CHILD = hash('23'), ETH_PARENT = hash('24'), ETH_CHILD = hash('25');
const BRIDGE = `0x${'33'.repeat(20)}`, TOKEN = `0x${'44'.repeat(20)}`, MINT = hash('55');
const CODE = '0x6000', CODE_HASH = createHash('sha256').update(Buffer.from('6000', 'hex')).digest('hex');
const ABI = new Interface(['function owner() view returns(address)', 'function sergToken() view returns(address)',
  'function paused() view returns(bool)', 'function totalSupply() view returns(uint256)', 'function balanceOf(address) view returns(uint256)',
  'function processedPegIns(bytes32) view returns(bool)', 'event Transfer(address indexed from,address indexed to,uint256 value)',
  'event PegIn(address indexed to,uint256 amount,bytes32 ergoBoxId)']);
let directory: string, owner: ReturnType<typeof createFederatedGenesisOperatorV1>;
let height: number, nativeSubmitted: boolean, mintSubmitted: boolean;
let native: ReturnType<typeof signFederatedGenesisReservationV1>;
let mint: Awaited<ReturnType<typeof signFederatedGenesisMintV1>>, extrinsic: string;
let calls: string[], active: boolean;
let fault: ((method: string, params: unknown[], result: any, url: string) => unknown) | undefined;
let context: Readonly<FederatedNativeMintContextV1>;
const storage: Record<string, string | null> = { '0x01': '0x01', '0x02': '0x02', '0x03': '0x01',
  '0x04': `0x04${MINT.slice(2)}`, '0x05': '0x0405', '0x06': null, '0x07': null };
let terminal: Record<string, string | null>;
const authorize = () => { if (!active) throw new Error('synthetic custody disposed'); };

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'bridge-native-mint-test-'));
  owner = createFederatedGenesisOperatorV1(); height = 0; nativeSubmitted = false; mintSubmitted = false;
  active = true; calls = []; fault = undefined;
  terminal = { ...storage, '0x04': '0x00', '0x05': null, '0x06': '0x0406' };
  native = signFederatedGenesisReservationV1(owner, { genesisHashHex: GENESIS, nonce: 0,
    statementHex: `0x04${'37'.repeat(602)}`, sourceProofEnvelopeScaleHex: `0x04${'53'.repeat(622)}` });
  // Real custody, signatures and filesystem. RPC responses are component doubles, not runtime acceptance.
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    expect(['http://127.0.0.1:19955', 'http://127.0.0.1:19956']).toContain(url);
    expect(init.redirect).toBe('error'); expect(init.signal).toBeInstanceOf(AbortSignal);
    const { method, params } = JSON.parse(init.body as string); calls.push(method);
    const selected = params[1] === PARENT ? 1 : height;
    const account = Buffer.from(owner.nativeFunding.accountInfoScaleHex.slice(2), 'hex'); account.writeUInt32LE(selected);
    let result: unknown;
    if (method === 'author_submitExtrinsic') { nativeSubmitted = true; result = native.extrinsicHashHex; }
    else if (method === 'eth_sendRawTransaction') {
      expect(params).toEqual([mint.signedTransactionHex]); expect(active).toBe(true);
      expect(JSON.parse(readFileSync(join(directory, 'native-mint-attempt.json'), 'utf8')))
        .toMatchObject({ transactionHashHex: mint.transactionHashHex, parentBlockHashHex: PARENT, mintIdentityHex: MINT });
      mintSubmitted = true; result = mint.transactionHashHex;
    } else if (method === 'engine_createBlock') {
      expect(params).toEqual([false, false, height === 0 ? GENESIS : PARENT]);
      height++; result = { hash: height === 1 ? PARENT : CHILD };
    } else if (method === 'chain_getBlockHash') result = params[0] === 0 ? GENESIS : params[0] === 1 ? PARENT : height === 2 ? CHILD : PARENT;
    else if (method === 'chain_getHeader') result = { number: `0x${height}` };
    else if (method === 'author_pendingExtrinsics') result = height === 0 && nativeSubmitted ? [native.signedExtrinsicHex]
      : height === 1 && mintSubmitted ? [extrinsic] : [];
    else if (method === 'state_getStorage') result = params[0] === owner.nativeFunding.storageKeyHex
      ? `0x${account.toString('hex')}` : (params[1] === CHILD ? terminal : storage)[params[0]] ?? null;
    else if (method === 'chain_getBlock') result = { block: { header: { parentHash: params[0] === PARENT ? GENESIS : PARENT,
      number: params[0] === PARENT ? '0x1' : '0x2', stateRoot: hash('66'), extrinsicsRoot: hash('67'), digest: { logs: [] } },
      extrinsics: ['0x1005010028', params[0] === PARENT ? native.signedExtrinsicHex : extrinsic] } };
    else if (method === 'eth_getBlockByNumber') result = { number: params[0], hash: params[0] === '0x1' ? ETH_PARENT : ETH_CHILD,
      transactions: params[0] === '0x1' ? [] : [mint.transactionHashHex] };
    else if (method === 'eth_getBlockByHash') result = { number: params[0] === ETH_PARENT ? '0x1' : '0x2', hash: params[0],
      transactions: params[0] === ETH_PARENT ? [] : [mint.transactionHashHex] };
    else if (method === 'eth_chainId') result = '0x1092';
    else if (method === 'eth_getTransactionCount') result = params[1].blockHash === ETH_PARENT ? '0x1' : '0x2';
    else if (method === 'eth_getCode') result = CODE;
    else if (method === 'eth_call') {
      const call = ABI.parseTransaction({ data: params[0].data })!;
      const minted = params[1].blockHash === ETH_CHILD;
      const value = call.name === 'owner' ? params[0].to === BRIDGE ? `0x${owner.addressHex}` : BRIDGE
        : call.name === 'sergToken' ? TOKEN : call.name === 'paused' ? false : call.name === 'processedPegIns' ? minted
          : minted ? 15000000n : 0n;
      result = ABI.encodeFunctionResult(call.name, [value]);
    } else if (method === 'eth_getTransactionReceipt') result = { transactionHash: mint.transactionHashHex, blockHash: ETH_CHILD,
      blockNumber: '0x2', transactionIndex: '0x0', status: '0x1', from: `0x${owner.addressHex}`, to: BRIDGE,
      logs: [ { address: TOKEN, ...ABI.encodeEventLog(ABI.getEvent('Transfer')!, [`0x${'00'.repeat(20)}`, `0x${owner.addressHex}`, 15000000n]) },
        { address: BRIDGE, ...ABI.encodeEventLog(ABI.getEvent('PegIn')!, [`0x${owner.addressHex}`, 15000000n, MINT]) } ].map((log, index) => ({ ...log,
        blockHash: ETH_CHILD, blockNumber: '0x2', transactionHash: mint.transactionHashHex, transactionIndex: '0x0', logIndex: `0x${index}`, removed: false })) };
    else throw new Error(`unexpected fixture RPC ${method}`);
    if (fault) result = fault(method, params, result, url);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
  }));
  const attempt = reserveFederatedNativeReservationAttemptV1(directory, { genesisHashHex: GENESIS,
    signedExtrinsicHex: native.signedExtrinsicHex, extrinsicHashHex: native.extrinsicHashHex });
  await submitFederatedNativeReservationV1(attempt, authorize);
  await sealFederatedNativeReservationV1(attempt, authorize);
  context = { reservation: { attempt, blockHashHex: PARENT, expectedStorage: { ...storage },
    operatorStorageKeyHex: owner.nativeFunding.storageKeyHex, originalOperatorAccountHex: owner.nativeFunding.accountInfoScaleHex },
    bridgeAddressHex: BRIDGE, tokenAddressHex: TOKEN, recipientAddressHex: `0x${owner.addressHex}`,
    amountNanoErg: '15000000', mintIdentityHex: MINT, bridgeCodeSha256Hex: CODE_HASH, bridgeCodeBytes: 2,
    tokenCodeSha256Hex: CODE_HASH, tokenCodeBytes: 2 };
});
afterEach(() => {
  disposeFederatedGenesisOperatorV1(owner); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (!resolve(directory).startsWith(`${resolve(tmpdir())}${sep}bridge-native-mint-test-`)) throw new Error('unexpected fixture directory');
  rmSync(directory, { recursive: true, force: true });
});
async function prepare() {
  const parent = await observeFederatedNativeMintParentV1(context, authorize);
  mint = await signFederatedGenesisMintV1(owner, { nonce: parent.nonce, bridgeAddressHex: BRIDGE,
    recipientAddressHex: `0x${owner.addressHex}`, amountNanoErg: '15000000', mintIdentityHex: MINT });
  extrinsic = encodeFederatedNativeMintExtrinsicV1Hex(mint.signedTransactionHex);
  return reserveFederatedNativeMintAttemptV1(directory, context, { signedTransactionHex: mint.signedTransactionHex,
    transactionHashHex: mint.transactionHashHex, nativeExtrinsicHex: extrinsic });
}
async function execute(attempt: Awaited<ReturnType<typeof prepare>>) {
  await submitFederatedNativeMintV1(attempt, authorize); await sealFederatedNativeMintV1(attempt, authorize);
  const result = await observeFederatedNativeMintInclusionV1(attempt, authorize);
  await observeFederatedNativeMintStateV1(attempt, terminal, authorize); return result;
}

describe('native FED mint execution consumer', () => {
  it.each(['eth_call', 'eth_sendRawTransaction', 'engine_createBlock'])
    ('holds the mint attempt after a standard %s error without exposing server detail', async selectedMethod => {
      const attempt = await prepare();
      const hold = readFileSync(join(directory, 'native-mint-attempt.json'), 'utf8');
      const originalFetch = globalThis.fetch;
      vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
        const response = await originalFetch(url, init);
        if (JSON.parse(init.body as string).method !== selectedMethod) return response;
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1,
          error: { code: -32603, message: 'untrusted node diagnostic', data: { detail: 'untrusted response data' } } }));
      }));
      const error = await execute(attempt).catch(error => error);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe(`native reservation RPC ${selectedMethod} rejected (code -32603); attempt remains held`);
      expect(error.cause).toBeUndefined();
      await expect(submitFederatedNativeMintV1(attempt, authorize)).rejects.toThrow(/consumed/);
      await expect(sealFederatedNativeMintV1(attempt, authorize)).rejects.toThrow(/not available/);
      await expect(observeFederatedNativeMintInclusionV1(attempt, authorize)).rejects.toThrow(/not sealed/);
      expect(calls.filter(method => method === 'eth_sendRawTransaction')).toHaveLength(selectedMethod === 'eth_call' ? 0 : 1);
      expect(calls.filter(method => method === 'engine_createBlock')).toHaveLength(selectedMethod === 'engine_createBlock' ? 2 : 1);
      expect(readFileSync(join(directory, 'native-mint-attempt.json'), 'utf8')).toBe(hold);
    });

  for (const surface of ['parent hash', 'child hash', 'receipt']) {
    it.each(['delay', 'timeout', 'divergence', 'disposal'])(`contains ${surface} mapping %s without another write`, async defect => {
      const attempt = await prepare(); let observations = 0;
      vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void, delay: number) => {
        expect(delay).toBe(250); queueMicrotask(callback); return 0;
      }) as never);
      fault = (method, params, result) => {
        const selected = surface === 'receipt' ? method === 'eth_getTransactionReceipt' : method === 'eth_getBlockByHash'
          && params[0] === (surface === 'parent hash' ? ETH_PARENT : ETH_CHILD);
        if (!selected) return result;
        observations++;
        if (defect === 'disposal') { active = false; return null; }
        if (defect === 'timeout' || defect === 'delay' && observations <= 2) return null;
        if (defect === 'divergence') return { ...result, [surface === 'receipt' ? 'transactionHash' : 'hash']: hash('77') };
        return result;
      };
      if (defect === 'delay') { await execute(attempt); expect(observations).toBeGreaterThanOrEqual(3); }
      else {
        await expect(execute(attempt)).rejects.toThrow(/timed out|differs|disposed/);
        expect(observations).toBe(defect === 'timeout' ? 60 : 1);
      }
      const sent = surface !== 'parent hash' || defect === 'delay';
      expect(calls.filter(method => method === 'eth_sendRawTransaction')).toHaveLength(sent ? 1 : 0);
      expect(calls.filter(method => method === 'engine_createBlock')).toHaveLength(sent ? 2 : 1);
    });
  }

  it('cannot reconstruct mint authority from a cold journal or copied attempt', async () => {
    const attempt = await prepare();
    await expect(submitFederatedNativeMintV1({ ...attempt }, authorize)).rejects.toThrow(/not original/);
    vi.resetModules();
    const cold = await import('./federated-native-reservation-execution-v1.js');
    await expect(cold.submitFederatedNativeMintV1(attempt, authorize)).rejects.toThrow(/not original/);
    expect(() => reserveFederatedNativeMintAttemptV1(directory, context, attempt)).toThrow(/EEXIST/);
    expect(calls).not.toContain('eth_sendRawTransaction');
  });

  it('consumes the parent reservation with separate native/Ethereum identities, exact token state and one durable attempt', async () => {
    const attempt = await prepare();
    expect(await execute(attempt)).toEqual({ blockHashHex: CHILD, ethereumBlockHashHex: ETH_CHILD, blockHeight: 2,
      transactionHashHex: mint.transactionHashHex, transactionIndex: 0, eventIndex: 1 });
    expect(calls.filter(method => method === 'eth_sendRawTransaction')).toHaveLength(1);
    expect(calls.filter(method => method === 'engine_createBlock')).toHaveLength(2);
    await expect(submitFederatedNativeMintV1(attempt, authorize)).rejects.toThrow(/consumed/);
    await expect(sealFederatedNativeMintV1(attempt, authorize)).rejects.toThrow(/not available/);
    expect(() => reserveFederatedNativeMintAttemptV1(directory, context, attempt)).toThrow(/EEXIST/);
  });

  it.each(['chain', 'nonce', 'bridge code', 'token code', 'owner', 'sergToken', 'paused', 'totalSupply', 'balanceOf', 'processedPegIns',
    'parent hash', 'pending', 'pool', 'Ethereum parent'])('rejects parent %s before transport', async defect => {
    const attempt = await prepare();
    fault = (method, params, result) => {
      if (defect === 'chain' && method === 'eth_chainId') return '0x2a';
      if (defect === 'nonce' && method === 'eth_getTransactionCount') return '0x0';
      if (defect.endsWith('code') && method === 'eth_getCode' && params[0] === (defect === 'bridge code' ? BRIDGE : TOKEN)) return '0x6001';
      if (method === 'eth_call' && ABI.parseTransaction({ data: (params[0] as any).data })!.name === defect) return `0x${'ff'.repeat(32)}`;
      if (defect === 'parent hash' && method === 'chain_getBlockHash' && params[0] === 1) return hash('77');
      if (defect === 'pending' && method === 'state_getStorage' && params[0] === '0x05') return null;
      if (defect === 'pool' && method === 'author_pendingExtrinsics') return [extrinsic];
      if (defect === 'Ethereum parent' && method === 'eth_getBlockByNumber') return { ...result, transactions: [hash('77')] };
      return result;
    };
    await expect(submitFederatedNativeMintV1(attempt, authorize)).rejects.toThrow(/differs|divergent|changed/);
    expect(calls).not.toContain('eth_sendRawTransaction');
    await expect(submitFederatedNativeMintV1(attempt, authorize)).rejects.toThrow(/consumed/);
  });

  it.each(['ambiguous hash', 'transport failure', 'disposed', 'changed hold', 'concurrent'])('holds %s without a second mint attempt', async defect => {
    const attempt = await prepare();
    if (defect === 'disposed') active = false;
    if (defect === 'changed hold') writeFileSync(join(directory, 'native-mint-attempt.json'), '{}');
    let parallel: Promise<unknown> | undefined;
    fault = (method, _params, result) => {
      if (method === 'eth_sendRawTransaction') {
        if (defect === 'ambiguous hash') return hash('77');
        if (defect === 'transport failure') throw new Error('synthetic transport failure');
        if (defect === 'concurrent') parallel = expect(submitFederatedNativeMintV1(attempt, authorize)).rejects.toThrow(/consumed/);
      }
      return result;
    };
    if (defect === 'concurrent') { await submitFederatedNativeMintV1(attempt, authorize); await parallel; }
    else { await expect(submitFederatedNativeMintV1(attempt, authorize)).rejects.toThrow(/ambiguous|failure|disposed|hold/);
      await expect(sealFederatedNativeMintV1(attempt, authorize)).rejects.toThrow(/not available|hold/); }
    expect(calls.filter(method => method === 'eth_sendRawTransaction')).toHaveLength(['disposed', 'changed hold'].includes(defect) ? 0 : 1);
  });

  it.each(['native call', 'native parent', 'native number', 'Ethereum hash', 'Ethereum transactions', 'receipt status', 'receipt tx',
    'receipt block', 'receipt from', 'receipt to', 'receipt index', 'event data', 'event address', 'event topics', 'event position',
    'event removed', 'totalSupply', 'balanceOf', 'processedPegIns', 'consumed', 'pending index', 'invalidated', 'head change'])
    ('rejects child %s without returning a completed mint', async defect => {
      const attempt = await prepare();
      await submitFederatedNativeMintV1(attempt, authorize); await sealFederatedNativeMintV1(attempt, authorize);
      fault = (method, params, result, url) => {
        if (method === 'chain_getBlock' && defect === 'native call') result.block.extrinsics[1] += '00';
        if (method === 'chain_getBlock' && defect === 'native parent') result.block.header.parentHash = GENESIS;
        if (method === 'chain_getBlock' && defect === 'native number') result.block.header.number = '0x3';
        if (method === 'eth_getBlockByNumber' && defect === 'Ethereum hash' && url.endsWith('19956')) result.hash = hash('77');
        if (method === 'eth_getBlockByNumber' && defect === 'Ethereum transactions') result.transactions.push(hash('77'));
        if (method === 'eth_getTransactionReceipt') {
          const receiptFields: Record<string, [string, unknown]> = { 'receipt status': ['status', '0x0'], 'receipt tx': ['transactionHash', hash('77')],
            'receipt block': ['blockHash', PARENT], 'receipt from': ['from', TOKEN], 'receipt to': ['to', TOKEN], 'receipt index': ['transactionIndex', '0x1'] };
          const field = receiptFields[defect]; if (field) result[field[0]] = field[1];
          if (defect === 'event data') result.logs[1].data += '00';
          if (defect === 'event address') result.logs[1].address = TOKEN;
          if (defect === 'event topics') result.logs[1].topics[1] = hash('77');
          if (defect === 'event position') result.logs[1].logIndex = '0x0';
          if (defect === 'event removed') result.logs[1].removed = true;
        }
        if (method === 'eth_call' && ABI.parseTransaction({ data: (params[0] as any).data })!.name === defect) return `0x${'00'.repeat(32)}`;
        if (method === 'state_getStorage' && ((defect === 'consumed' && params[0] === '0x06')
          || (defect === 'pending index' && params[0] === '0x04') || (defect === 'invalidated' && params[0] === '0x07'))) return '0x01';
        if (defect === 'head change' && method === 'chain_getBlockHash' && params.length === 0) return hash('77');
        return result;
      };
      await expect((async () => { await observeFederatedNativeMintInclusionV1(attempt, authorize);
        await observeFederatedNativeMintStateV1(attempt, terminal, authorize); })()).rejects.toThrow(/differs|disagree|changed/);
      expect(calls.filter(method => method === 'eth_sendRawTransaction')).toHaveLength(1);
    });
});
