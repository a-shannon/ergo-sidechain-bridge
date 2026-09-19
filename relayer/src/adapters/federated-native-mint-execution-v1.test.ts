import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import blakejs from 'blakejs';
import { HDNodeWallet, Interface, Transaction } from 'ethers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFederatedGenesisOperatorV1, disposeFederatedGenesisOperatorV1,
  assertFederatedGenesisOperatorV1, signFederatedGenesisApproveV1, signFederatedGenesisBurnV1,
  signFederatedGenesisReservationV1, signFederatedGenesisMintV1 } from './federated-genesis-operator-v1.js';
import { encodeFederatedNativeMintExtrinsicV1Hex } from '../federated-native-mint-runtime-state-v1.js';
import { reserveFederatedNativeReservationAttemptV1, submitFederatedNativeReservationV1,
  sealFederatedNativeReservationV1, observeFederatedNativeMintParentV1, reserveFederatedNativeMintAttemptV1,
  submitFederatedNativeMintV1, sealFederatedNativeMintV1, observeFederatedNativeMintInclusionV1,
  observeFederatedNativeMintStateV1, type FederatedNativeMintContextV1,
  observeFederatedNativeWithdrawalParentV1, reserveFederatedNativeWithdrawalAttemptV1,
  submitFederatedNativeWithdrawalV1, sealFederatedNativeWithdrawalV1, observeFederatedNativeWithdrawalInclusionV1,
  collectFederatedNativeBurnCommitmentV1,
  observeFederatedNativeContinuationParentV1, assertFederatedNativeContinuationParentV1,
  reobserveFederatedNativeContinuationParentV1, reserveFederatedNativeContinuationReservationAttemptV1,
  observeFederatedNativeReservationInclusionV1,
  type FederatedNativeWithdrawalContextV1 } from './federated-native-reservation-execution-v1.js';

const hash = (byte: string) => `0x${byte.repeat(32)}`;
const GENESIS = hash('11'), PARENT = hash('22'), CHILD = hash('23'), ETH_PARENT = hash('24'), ETH_CHILD = hash('25');
const BRIDGE = `0x${'33'.repeat(20)}`, TOKEN = `0x${'44'.repeat(20)}`, MINT = hash('55');
const CODE = '0x6000', CODE_HASH = createHash('sha256').update(Buffer.from('6000', 'hex')).digest('hex');
const ABI = new Interface(['function owner() view returns(address)', 'function sergToken() view returns(address)',
  'function paused() view returns(bool)', 'function totalSupply() view returns(uint256)', 'function balanceOf(address) view returns(uint256)',
  'function processedPegIns(bytes32) view returns(bool)', 'event Transfer(address indexed from,address indexed to,uint256 value)',
  'event PegIn(address indexed to,uint256 amount,bytes32 ergoBoxId)',
  'function approve(address,uint256)', 'function pegOut(uint256,bytes)',
  'function allowance(address,address) view returns(uint256)', 'function accumulatedFees() view returns(uint256)',
  'event Approval(address indexed owner,address indexed spender,uint256 value)',
  'event PegOut(address indexed from,uint256 amount,bytes ergoRecipientPubKey)']);
const NATIVE_BLOCKS = [GENESIS, PARENT, CHILD, hash('26'), hash('27')];
const ETH_BLOCKS = [hash('28'), ETH_PARENT, ETH_CHILD, hash('29'), hash('2a')];
const RECIPIENT = '0x0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const OTHER_RECIPIENT = RECIPIENT.replace('cd02', 'cd03');
const ZERO = `0x${'00'.repeat(20)}`;
const SIDECHAIN = hash('72');
const COMMITMENT_KEY = '0xaf86fef4216ac2bcd1c592b204011ad00d2d4fb825af1fcd4c2be9f955a780c5';
const LEAVES_KEY = '0xaf86fef4216ac2bcd1c592b204011ad08ba92642ec2dee14a0170da020901c7f';
const EVENTS_KEY = '0x26aa394eea5630e07c48ae0c9558cef780d41e5e16056765bc8461851072c9d7';
type WithdrawalPhase = 'approve' | 'burn';
type WithdrawalAttempt = ReturnType<typeof reserveFederatedNativeWithdrawalAttemptV1>;
let withdrawalMode: boolean, withdrawalPending: boolean;
let withdrawalTransactions: Map<number, WithdrawalAttempt>;
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
  withdrawalMode = false; withdrawalPending = false; withdrawalTransactions = new Map();
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
    if (withdrawalMode) result = withdrawalRpc(method, params);
    else if (method === 'author_submitExtrinsic') { nativeSubmitted = true; result = native.extrinsicHashHex; }
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
          : minted ? BigInt(context.amountNanoErg) : 0n;
      result = ABI.encodeFunctionResult(call.name, [value]);
    } else if (method === 'eth_getTransactionReceipt') result = { transactionHash: mint.transactionHashHex, blockHash: ETH_CHILD,
      blockNumber: '0x2', transactionIndex: '0x0', status: '0x1', from: `0x${owner.addressHex}`, to: BRIDGE,
      logs: [ { address: TOKEN, ...ABI.encodeEventLog(ABI.getEvent('Transfer')!, [`0x${'00'.repeat(20)}`, `0x${owner.addressHex}`, context.amountNanoErg]) },
        { address: BRIDGE, ...ABI.encodeEventLog(ABI.getEvent('PegIn')!, [`0x${owner.addressHex}`, context.amountNanoErg, MINT]) } ].map((log, index) => ({ ...log,
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
  expect(existsSync(directory)).toBe(false);
});
async function prepare() {
  const parent = await observeFederatedNativeMintParentV1(context, authorize);
  mint = await signFederatedGenesisMintV1(owner, { nonce: parent.nonce, bridgeAddressHex: BRIDGE,
    recipientAddressHex: `0x${owner.addressHex}`, amountNanoErg: context.amountNanoErg, mintIdentityHex: MINT });
  extrinsic = encodeFederatedNativeMintExtrinsicV1Hex(mint.signedTransactionHex);
  return reserveFederatedNativeMintAttemptV1(directory, context, { signedTransactionHex: mint.signedTransactionHex,
    transactionHashHex: mint.transactionHashHex, nativeExtrinsicHex: extrinsic });
}
async function execute(attempt: Awaited<ReturnType<typeof prepare>>) {
  await submitFederatedNativeMintV1(attempt, authorize); await sealFederatedNativeMintV1(attempt, authorize);
  const result = await observeFederatedNativeMintInclusionV1(attempt, authorize);
  await observeFederatedNativeMintStateV1(attempt, terminal, authorize); return result;
}

const withdrawalAuthorize = () => { authorize(); assertFederatedGenesisOperatorV1(owner); };
const writes = () => calls.filter(method => ['eth_sendRawTransaction', 'engine_createBlock'].includes(method));
const holdPath = (phase: WithdrawalPhase) => join(directory, `native-${phase}-attempt.json`);
const quantity = (value: number | bigint) => `0x${value.toString(16)}`;

// These paired RPC doubles describe component expectations, not Frontier execution evidence.
function withdrawalRpc(method: string, params: any[]): unknown {
  const at = (number: number) => withdrawalTransactions.get(number)!;
  if (method === 'eth_sendRawTransaction') {
    const attempt = at(height + 1), phase = height === 2 ? 'approve' : 'burn';
    withdrawalAuthorize();
    expect(params).toEqual([attempt.signedTransactionHex]);
    expect(JSON.parse(readFileSync(holdPath(phase), 'utf8'))).toEqual({
      schema: 'e2s.fed-native-withdrawal-attempt.v1', status: 'reserved', phase,
      parentBlockHashHex: NATIVE_BLOCKS[height], mintIdentityHex: MINT,
      grossAmountNanoErg: '15000000', recipientErgoTreeHex: RECIPIENT, ...attempt,
    });
    withdrawalPending = true;
    return attempt.transactionHashHex;
  }
  if (method === 'engine_createBlock') {
    withdrawalAuthorize(); expect(withdrawalPending).toBe(true);
    expect(params).toEqual([false, false, NATIVE_BLOCKS[height]]);
    withdrawalPending = false; return { hash: NATIVE_BLOCKS[++height] };
  }
  if (method === 'chain_getBlockHash') return NATIVE_BLOCKS[params.length ? params[0] : height];
  if (method === 'chain_getHeader') return { number: quantity(height) };
  if (method === 'author_pendingExtrinsics') return withdrawalPending ? [at(height + 1).nativeExtrinsicHex] : [];
  if (method === 'state_getStorage') {
    const selected = NATIVE_BLOCKS.indexOf(params[1]); expect(selected).toBeGreaterThanOrEqual(2);
    if (selected === 4 && [COMMITMENT_KEY, LEAVES_KEY, EVENTS_KEY].includes(params[0])) return nativeBurnStorage()[params[0]];
    if (params[0] !== owner.nativeFunding.storageKeyHex) return terminal[params[0]] ?? null;
    const account = Buffer.from(owner.nativeFunding.accountInfoScaleHex.slice(2), 'hex');
    account.writeUInt32LE(selected); return `0x${account.toString('hex')}`;
  }
  if (method === 'chain_getBlock') {
    const selected = NATIVE_BLOCKS.indexOf(params[0]);
    return { block: { header: { parentHash: NATIVE_BLOCKS[selected - 1], number: quantity(selected),
      stateRoot: hash('66'), extrinsicsRoot: hash('67'), digest: { logs: [] } },
    extrinsics: ['0x1005010028', at(selected).nativeExtrinsicHex] } };
  }
  if (method === 'eth_getBlockByNumber' || method === 'eth_getBlockByHash') {
    const selected = method === 'eth_getBlockByNumber' ? Number(BigInt(params[0])) : ETH_BLOCKS.indexOf(params[0]);
    return { number: quantity(selected), hash: ETH_BLOCKS[selected], parentHash: ETH_BLOCKS[selected - 1],
      baseFeePerGas: quantity(selected === 2 ? 1_125_000_000n : 1_265_625_000n),
      transactions: [at(selected).transactionHashHex] };
  }
  if (method === 'eth_chainId') return '0x1092';
  if (method === 'eth_getTransactionCount' || method === 'eth_getCode' || method === 'eth_call') {
    const selected = ETH_BLOCKS.indexOf(params[1].blockHash);
    expect(params[1]).toEqual({ blockHash: ETH_BLOCKS[selected], requireCanonical: true });
    expect(selected).toBeGreaterThanOrEqual(2);
    if (method === 'eth_getTransactionCount') { expect(params[0]).toBe(`0x${owner.addressHex}`); return quantity(selected); }
    if (method === 'eth_getCode') { expect([TOKEN, BRIDGE]).toContain(params[0]); return CODE; }
    const call = ABI.parseTransaction({ data: params[0].data })!;
    const burned = selected === 4, minted = BigInt(context.amountNanoErg);
    const value = call.name === 'owner' ? params[0].to === BRIDGE ? `0x${owner.addressHex}` : BRIDGE
      : call.name === 'sergToken' ? TOKEN : call.name === 'paused' ? false : call.name === 'processedPegIns' ? true
        : call.name === 'totalSupply' ? minted - (burned ? 10000000n : 0n)
          : call.name === 'balanceOf' ? call.args[0].toLowerCase() === BRIDGE ? burned ? 5000000n : 0n : minted - (burned ? 15000000n : 0n)
            : call.name === 'allowance' ? selected === 2 ? 0n : burned ? 10000000n : 15000000n
              : call.name === 'accumulatedFees' ? burned ? 5000000n : 0n : undefined;
    if (value === undefined) throw new Error(`unexpected withdrawal view ${call.name}`);
    return ABI.encodeFunctionResult(call.name, [value]);
  }
  if (method === 'eth_getTransactionReceipt') {
    const selected = [...withdrawalTransactions].find(([, attempt]) => attempt.transactionHashHex === params[0])![0];
    const operator = `0x${owner.addressHex}`;
    const logs = selected === 3
      ? [{ address: TOKEN, ...ABI.encodeEventLog(ABI.getEvent('Approval')!, [operator, BRIDGE, 15000000n]) }]
      : [{ address: TOKEN, ...ABI.encodeEventLog(ABI.getEvent('Transfer')!, [operator, ZERO, 10000000n]) },
        { address: TOKEN, ...ABI.encodeEventLog(ABI.getEvent('Transfer')!, [operator, BRIDGE, 5000000n]) },
        { address: BRIDGE, ...ABI.encodeEventLog(ABI.getEvent('PegOut')!, [operator, 10000000n, RECIPIENT]) }];
    const inclusion = { transactionHash: params[0], blockHash: ETH_BLOCKS[selected], blockNumber: quantity(selected), transactionIndex: '0x0' };
    return { ...inclusion, status: '0x1', from: operator, to: selected === 3 ? TOKEN : BRIDGE,
      logs: logs.map((log, index) => ({ ...log, ...inclusion, logIndex: quantity(index), removed: false })) };
  }
  throw new Error(`unexpected withdrawal fixture RPC ${method}`);
}

// Expected corrected producer semantics: profile sidechain identity is deliberately not native genesis.
// The original three-overlay native runtime used genesis here; its producer correction is a separate gate.
function nativeBurnStorage(): Record<string, string> {
  const attempt = withdrawalTransactions.get(4)!;
  const blake = (bytes: Buffer) => Buffer.from(blakejs.blake2b(bytes, undefined, 32));
  const decode = (hex: string) => Buffer.from(hex.replace(/^0x/, ''), 'hex');
  const integer = (value: bigint, bytes: number) => { const result = Buffer.alloc(bytes); result.writeBigUInt64LE(value); return result; };
  const eventIndex = Buffer.from('00000002', 'hex'), amount = Buffer.from('0000000000989680', 'hex');
  const burnId = blake(Buffer.concat([Buffer.from('E2S_TRUSTLESS_BURN_ID_V1'), decode(SIDECHAIN), decode(attempt.transactionHashHex), eventIndex]));
  const leaf = Buffer.concat([Buffer.from([1]), decode(SIDECHAIN), decode(ETH_BLOCKS[4]!), burnId,
    decode(attempt.transactionHashHex), eventIndex, blake(decode(RECIPIENT)), amount, Buffer.alloc(32)]);
  const root = blake(Buffer.concat([Buffer.from('E2S_TRUSTLESS_BURN_LEAF_V1'), leaf]));
  const commitment = Buffer.concat([Buffer.from([1]), decode(SIDECHAIN), integer(4n, 8), decode(ETH_BLOCKS[4]!), root, Buffer.from('01000000', 'hex')]);
  const compact = (size: number) => size < 64 ? Buffer.from([size * 4]) : Buffer.from([((size * 4 + 1) & 255), (size * 4 + 1) >>> 8]);
  const apply = (index: number) => Buffer.from([0, index, 0, 0, 0]);
  const event = (phase: Buffer, pallet: number, variant: number, ...fields: Buffer[]) =>
    Buffer.concat([phase, Buffer.from([pallet, variant]), ...fields, Buffer.from([0])]);
  const operator = decode(owner.addressHex), appPhase = apply(1);
  const records = [event(apply(0), 0, 0, Buffer.from([0, 0, 2, 0])),
    event(appPhase, 4, 8, operator, integer(7_119_140_625_000_000n, 16)),
    event(appPhase, 4, 7, operator, integer(7_000_000_000_000_000n, 16)),
    event(appPhase, 4, 7, decode(ZERO), integer(0n, 16))];
  const receipt = withdrawalRpc('eth_getTransactionReceipt', [attempt.transactionHashHex]) as { logs: { address: string; topics: string[]; data: string }[] };
  for (const log of receipt.logs) records.push(event(appPhase, 8, 0, decode(log.address), compact(log.topics.length),
    ...log.topics.map(decode), compact(decode(log.data).length), decode(log.data)));
  records.push(event(appPhase, 7, 0, operator, decode(BRIDGE), decode(attempt.transactionHashHex), Buffer.from([0, 0, 0])),
    event(appPhase, 0, 0, Buffer.from([0, 0, 0, 1])),
    event(Buffer.from([1]), 12, 1, Buffer.from([1]), decode(ETH_BLOCKS[4]!), root, Buffer.from('01000000', 'hex')));
  return { [COMMITMENT_KEY]: `0x${commitment.toString('hex')}`, [LEAVES_KEY]: `0x04${root.toString('hex')}`,
    [EVENTS_KEY]: `0x${Buffer.concat([compact(records.length), ...records]).toString('hex')}` };
}

async function completedMint() {
  const mintAttempt = await prepare(); await execute(mintAttempt);
  withdrawalMode = true; withdrawalTransactions.set(2, mintAttempt);
  return { mintAttempt, approvalAttempt: null, grossAmountNanoErg: '15000000', recipientErgoTreeHex: RECIPIENT } satisfies FederatedNativeWithdrawalContextV1;
}

async function signWithdrawal(context: FederatedNativeWithdrawalContextV1) {
  const parent = await observeFederatedNativeWithdrawalParentV1(context, withdrawalAuthorize);
  const nonce = context.approvalAttempt === null ? 2 : 3;
  expect(parent).toEqual({ nonce, parentNativeHeight: nonce }); expect(Object.isFrozen(parent)).toBe(true);
  const signed = await (nonce === 2 ? signFederatedGenesisApproveV1 : signFederatedGenesisBurnV1)(owner, {
    ...parent, bridgeAddressHex: BRIDGE, tokenAddressHex: TOKEN,
    grossAmountNanoErg: context.grossAmountNanoErg, recipientErgoTreeHex: context.recipientErgoTreeHex,
  });
  const candidate = { signedTransactionHex: signed.signedTransactionHex, transactionHashHex: signed.transactionHashHex,
    nativeExtrinsicHex: encodeFederatedNativeMintExtrinsicV1Hex(signed.signedTransactionHex) };
  withdrawalTransactions.set(nonce + 1, candidate); return candidate;
}

async function executeWithdrawal(attempt: WithdrawalAttempt) {
  await submitFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize);
  await sealFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize);
  return observeFederatedNativeWithdrawalInclusionV1(attempt, withdrawalAuthorize);
}

async function withdrawalContext(phase: WithdrawalPhase): Promise<FederatedNativeWithdrawalContextV1> {
  const context: FederatedNativeWithdrawalContextV1 = await completedMint();
  if (phase === 'burn') {
    const approvalAttempt = reserveFederatedNativeWithdrawalAttemptV1(context, await signWithdrawal(context));
    await executeWithdrawal(approvalAttempt); return { ...context, approvalAttempt };
  }
  return context;
}

async function prepareWithdrawal(phase: WithdrawalPhase) {
  const context = await withdrawalContext(phase), signed = await signWithdrawal(context);
  const attempt = reserveFederatedNativeWithdrawalAttemptV1(context, signed);
  return { context, signed, attempt };
}

describe('native FED continuation reservation', () => {
  async function parent() {
    const { attempt } = await prepareWithdrawal('burn');
    await executeWithdrawal(attempt);
    return { burn: attempt, parent: await observeFederatedNativeContinuationParentV1(attempt, withdrawalAuthorize) };
  }
  function nextCandidate() {
    // Execution-boundary fixture only. Composed tests use the real proof-bound continuation signer.
    const bytes = Buffer.from(native.signedExtrinsicHex.slice(2), 'hex');
    const offset = [1, 2, 4, 5][bytes[0]! & 3]!;
    bytes[offset + 87] = 16;
    return { genesisHashHex: GENESIS, signedExtrinsicHex: `0x${bytes.toString('hex')}`,
      extrinsicHashHex: `0x${Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex')}` };
  }
  function childFixture(candidate: ReturnType<typeof nextCandidate>) {
    const nextHash = hash('79');
    const expectedStorage: Record<string, string | null> = { ...terminal, '0x09': '0x04' };
    let pending = false, included = false;
    const priorFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const { method, params } = JSON.parse(init.body as string);
      let handled = true, result: unknown;
      if (method === 'author_submitExtrinsic') { expect(params).toEqual([candidate.signedExtrinsicHex]); pending = true; result = candidate.extrinsicHashHex; }
      else if (method === 'engine_createBlock') { expect(params).toEqual([false, false, NATIVE_BLOCKS[4]]); pending = false; included = true; result = { hash: nextHash }; }
      else if (method === 'author_pendingExtrinsics') result = pending ? [candidate.signedExtrinsicHex] : [];
      else if (method === 'chain_getBlockHash' && (params[0] === 5 || included && params.length === 0)) result = included ? nextHash : null;
      else if (method === 'chain_getBlock' && params[0] === nextHash) result = { block: { header: {
        parentHash: NATIVE_BLOCKS[4], number: '0x5', stateRoot: hash('66'), extrinsicsRoot: hash('67'), digest: { logs: [] } },
      extrinsics: ['0x1005010028', candidate.signedExtrinsicHex] } };
      else if (method === 'state_getStorage' && params[1] === nextHash) {
        const account = Buffer.from(owner.nativeFunding.accountInfoScaleHex.slice(2), 'hex'); account.writeUInt32LE(5);
        result = params[0] === owner.nativeFunding.storageKeyHex ? `0x${account.toString('hex')}` : expectedStorage[params[0]] ?? null;
      } else handled = false;
      if (!handled) return priorFetch(url, init);
      calls.push(method);
      if (fault) result = fault(method, params, result, url);
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
    }));
    return { nextHash, expectedStorage };
  }

  it('reserves once on confirmed burn four, seals five and preserves the previous consumed state', async () => {
    const observed = await parent(), before = [...writes()];
    expect(observed.parent).toMatchObject({ genesisHashHex: GENESIS, blockHashHex: NATIVE_BLOCKS[4],
      ethereumBlockHashHex: ETH_BLOCKS[4], nonce: 4, blockHeight: 4, previousMintIdentityHex: MINT,
      previousBurnTransactionHashHex: observed.burn.transactionHashHex });
    const repeated = await observeFederatedNativeContinuationParentV1(observed.burn, withdrawalAuthorize);
    expect(repeated).toBe(observed.parent); expect(writes()).toEqual(before);
    const candidate = nextCandidate(), fixture = childFixture(candidate);
    const childDirectory = mkdtempSync(join(directory, 'next-'));
    const attempt = reserveFederatedNativeContinuationReservationAttemptV1(childDirectory, observed.parent, candidate);
    expect(JSON.parse(readFileSync(join(childDirectory, 'native-reservation-attempt.json'), 'utf8')))
      .toMatchObject({ parentBlockHashHex: NATIVE_BLOCKS[4], parentEthereumBlockHashHex: ETH_BLOCKS[4], nonce: 4 });
    await submitFederatedNativeReservationV1(attempt, withdrawalAuthorize);
    const blockHashHex = await sealFederatedNativeReservationV1(attempt, withdrawalAuthorize);
    const result = await observeFederatedNativeReservationInclusionV1({ attempt, blockHashHex,
      expectedStorage: fixture.expectedStorage, operatorStorageKeyHex: observed.parent.operatorStorageKeyHex,
      originalOperatorAccountHex: observed.parent.operatorAccountInfoHex }, withdrawalAuthorize);
    expect(result).toMatchObject({ blockHeight: 5, blockHashHex: fixture.nextHash, mintAuthorized: false, sourceFinalityEstablished: false });
    expect(() => reserveFederatedNativeContinuationReservationAttemptV1(childDirectory, observed.parent, candidate)).toThrow(/claimed/);
    await expect(submitFederatedNativeReservationV1(attempt, withdrawalAuthorize)).rejects.toThrow(/consumed/);
    await expect(observeFederatedNativeContinuationParentV1(observed.burn, withdrawalAuthorize)).rejects.toThrow(/claimed/);
  });

  it.each(['copy', 'approval', 'unobserved burn', 'disposed'])('rejects %s as continuation provenance', async defect => {
    const { attempt, context: withdrawal } = await prepareWithdrawal('burn');
    if (defect !== 'unobserved burn') await executeWithdrawal(attempt);
    if (defect === 'disposed') disposeFederatedGenesisOperatorV1(owner);
    const selected = defect === 'copy' ? { ...attempt } : defect === 'approval' ? withdrawal.approvalAttempt! : attempt;
    const before = [...calls];
    await expect(observeFederatedNativeContinuationParentV1(selected, withdrawalAuthorize)).rejects.toThrow(/original|confirmed|disposed/);
    expect(calls).toEqual(before);
  });

  it.each(['native head', 'genesis', 'ethereum parent', 'ethereum nonce', 'native nonce', 'account disagreement', 'consumed state', 'balance'])
    ('rejects observed-parent drift: %s', async defect => {
      const { parent: observed } = await parent(), before = [...writes()];
      fault = (method, params, value, url) => {
        if (defect === 'native head' && method === 'chain_getBlockHash' && !params.length) return hash('ee');
        if (defect === 'genesis' && method === 'chain_getBlockHash' && params[0] === 0) return hash('ee');
        if (defect === 'ethereum parent' && method === 'eth_getBlockByNumber') return { ...(value as object), parentHash: hash('ee') };
        if (defect === 'ethereum nonce' && method === 'eth_getTransactionCount') return '0x3';
        if (method === 'state_getStorage' && params[0] === owner.nativeFunding.storageKeyHex) {
          const bytes = Buffer.from((value as string).slice(2), 'hex');
          if (defect === 'native nonce') { bytes.writeUInt32LE(3); return `0x${bytes.toString('hex')}`; }
          if (defect === 'account disagreement' && url.endsWith('19956')) { bytes[16] = bytes[16]! ^ 1; return `0x${bytes.toString('hex')}`; }
        }
        if (defect === 'consumed state' && method === 'state_getStorage' && params[0] === Object.keys(terminal)[0]) return '0xff';
        if (defect === 'balance' && method === 'eth_call' && ABI.parseTransaction({ data: (params[0] as { data: string }).data })!.name === 'totalSupply') return ABI.encodeFunctionResult('totalSupply', [0n]);
        return value;
      };
      await expect(reobserveFederatedNativeContinuationParentV1(observed, withdrawalAuthorize)).rejects.toThrow(/differs|changed/);
      expect(writes()).toEqual(before);
    });

  it('keeps original custody after a copied parent or caller replacement', async () => {
    const { parent: observed } = await parent();
    expect(() => assertFederatedNativeContinuationParentV1({ ...observed })).toThrow(/original/);
    active = false;
    await expect(reobserveFederatedNativeContinuationParentV1(observed, () => {})).rejects.toThrow();
    expect(() => reserveFederatedNativeContinuationReservationAttemptV1(directory, observed, nextCandidate())).toThrow();
  });

  it.each(['before submit', 'before seal', 'changed hold', 'changed predecessor hold', 'wrong nonce', 'wrong child parent', 'lost consumed state'])
    ('holds a failed continuation without retry: %s', async defect => {
      const { parent: observed } = await parent(), candidate = nextCandidate(), fixture = childFixture(candidate);
      const childDirectory = mkdtempSync(join(directory, 'next-'));
      if (defect === 'wrong nonce') {
        const bytes = Buffer.from(candidate.signedExtrinsicHex.slice(2), 'hex'); bytes[[1, 2, 4, 5][bytes[0]! & 3]! + 87] = 12;
        candidate.signedExtrinsicHex = `0x${bytes.toString('hex')}`;
        candidate.extrinsicHashHex = `0x${Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex')}`;
        expect(() => reserveFederatedNativeContinuationReservationAttemptV1(childDirectory, observed, candidate)).toThrow(/nonce/); return;
      }
      const attempt = reserveFederatedNativeContinuationReservationAttemptV1(childDirectory, observed, candidate);
      const path = join(childDirectory, 'native-reservation-attempt.json'), held = readFileSync(path, 'utf8');
      if (defect === 'changed hold') writeFileSync(path, '{}');
      if (defect === 'changed predecessor hold') writeFileSync(holdPath('burn'), '{}');
      if (defect === 'before submit') fault = (method, params, value) => method === 'chain_getBlockHash' && !params.length ? hash('ee') : value;
      if (['before submit', 'changed hold', 'changed predecessor hold'].includes(defect)) {
        await expect(submitFederatedNativeReservationV1(attempt, withdrawalAuthorize)).rejects.toThrow(/changed/);
        if (defect === 'before submit') { fault = undefined; await expect(submitFederatedNativeReservationV1(attempt, withdrawalAuthorize)).rejects.toThrow(/consumed/); }
        return;
      }
      await submitFederatedNativeReservationV1(attempt, withdrawalAuthorize);
      if (defect === 'before seal') {
        fault = (method, params, value) => method === 'chain_getBlockHash' && !params.length ? hash('ee') : value;
        await expect(sealFederatedNativeReservationV1(attempt, withdrawalAuthorize)).rejects.toThrow(/changed/);
        fault = undefined; await expect(sealFederatedNativeReservationV1(attempt, withdrawalAuthorize)).rejects.toThrow(/not available/); return;
      }
      const blockHashHex = await sealFederatedNativeReservationV1(attempt, withdrawalAuthorize);
      if (defect === 'wrong child parent') fault = (method, params, value) => method === 'chain_getBlock'
        ? { block: { ...(value as any).block, header: { ...(value as any).block.header, parentHash: GENESIS } } } : value;
      const expectedStorage = { ...fixture.expectedStorage };
      if (defect === 'lost consumed state') delete expectedStorage[Object.keys(terminal)[0]!];
      await expect(observeFederatedNativeReservationInclusionV1({ attempt, blockHashHex, expectedStorage,
        operatorStorageKeyHex: observed.operatorStorageKeyHex, originalOperatorAccountHex: observed.operatorAccountInfoHex }, withdrawalAuthorize))
        .rejects.toThrow(/header|preceding/);
      expect(readFileSync(path, 'utf8')).toBe(held);
    });
});

describe('native FED burn commitment collector', () => {
  async function observedBurn() {
    const { attempt } = await prepareWithdrawal('burn'); await executeWithdrawal(attempt); return attempt;
  }

  it('joins the original observed burn to exact paired runtime storage, global index and unchanged burn proof', async () => {
    const attempt = await observedBurn(), before = writes();
    const result = await collectFederatedNativeBurnCommitmentV1(attempt, SIDECHAIN, withdrawalAuthorize);
    expect(result).toMatchObject({ sidechainIdHex: SIDECHAIN, nativeGenesisHashHex: GENESIS,
      blockHashHex: NATIVE_BLOCKS[4], ethereumBlockHashHex: ETH_BLOCKS[4], blockHeight: 4,
      transactionHashHex: attempt.transactionHashHex, eventIndex: 2, burnLeafCount: 1,
      sourceFinalityEstablished: false, trustless: false,
      burnEvent: { amountNanoErg: '10000000', eventIndex: 2, transactionIndex: 0, recipientErgoTreeHex: RECIPIENT.slice(2) },
      burnProof: { leafIndex: 0, leafCount: 1, proof: [], leaf: { sidechainIdHex: SIDECHAIN.slice(2),
        sidechainBlockHashHex: ETH_BLOCKS[4]!.slice(2), eventIndex: 2, amountNanoErg: '10000000' } } });
    expect(result.commitmentScaleHex).toBe(nativeBurnStorage()[COMMITMENT_KEY]);
    expect(result.leafHashesScaleHex).toBe(`0x04${result.burnProof.leaf.leafHashHex}`);
    expect(result.bridgeEventRootHex).toBe(`0x${result.burnProof.bridgeEventRootHex}`);
    expect(result.systemEventsScaleHex).toBe(nativeBurnStorage()[EVENTS_KEY]);
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.burnProof)).toBe(true);
    expect(Object.isFrozen(result.burnProof.leaf)).toBe(true); expect(Object.isFrozen(result.burnProof.proof)).toBe(true);
    expect(Object.isFrozen(result.burnEvent)).toBe(true); expect(writes()).toEqual(before);
  });

  it.each(['copy', 'approval', 'unobserved', 'disposed', 'wrong sidechain'] as const)('rejects %s without transport', async defect => {
    const { attempt } = await prepareWithdrawal(defect === 'approval' ? 'approve' : 'burn');
    if (defect !== 'unobserved') await executeWithdrawal(attempt);
    if (defect === 'disposed') active = false;
    const before = writes();
    await expect(collectFederatedNativeBurnCommitmentV1(defect === 'copy' ? { ...attempt } : attempt,
      defect === 'wrong sidechain' ? GENESIS : SIDECHAIN, withdrawalAuthorize)).rejects.toThrow();
    expect(writes()).toEqual(before);
  });

  for (const node of ['19955', '19956']) {
    it.each(['absent commitment', 'commitment length', 'format', 'sidechain', 'height', 'Ethereum hash', 'root', 'count',
      'native hash as Ethereum', 'absent leaves', 'leaf length', 'leaf count', 'leaf hash', 'leaf trailing'] as const)
      (`rejects runtime %s on ${node}`, async defect => {
        const attempt = await observedBurn(), before = writes(); let injected = 0;
        fault = (method, params, result, url) => {
          const leaves = defect.includes('leav') || defect.startsWith('leaf ');
          if (method !== 'state_getStorage' || params[0] !== (leaves ? LEAVES_KEY : COMMITMENT_KEY) || !url.endsWith(node)) return result;
          injected++; if (defect.startsWith('absent')) return null;
          if (defect.endsWith('length')) return result.slice(0, -2);
          if (defect === 'leaf trailing') return `${result}00`;
          const bytes = Buffer.from(result.slice(2), 'hex');
          if (defect === 'native hash as Ethereum') Buffer.from(NATIVE_BLOCKS[4]!.slice(2), 'hex').copy(bytes, 41);
          else { const position = ({ format: 0, sidechain: 1, height: 33, 'Ethereum hash': 41, root: 73, count: 105,
            'leaf count': 0, 'leaf hash': 1 } as Record<string, number>)[defect]!; bytes[position]! ^= 1; }
          return `0x${bytes.toString('hex')}`;
        };
        await expect(collectFederatedNativeBurnCommitmentV1(attempt, SIDECHAIN, withdrawalAuthorize)).rejects.toThrow(/commitment or leaves differ/);
        expect(injected).toBe(1); expect(writes()).toEqual(before);
      });

    it.each(['absent', 'truncated', 'trailing', 'unknown event', 'duplicate root', 'root phase', 'root pallet', 'root variant',
      'root format', 'root Ethereum hash', 'root hash', 'root count', 'root topics', 'outer count', 'noncanonical count',
      'success index', 'success class', 'success fee', 'fee count', 'EVM address', 'Ethereum from', 'Ethereum failure'] as const)
      (`rejects structural events %s on ${node}`, async defect => {
        const attempt = await observedBurn(), before = writes(); let injected = 0;
        fault = (method, params, result, url) => {
          if (method !== 'state_getStorage' || params[0] !== EVENTS_KEY || !url.endsWith(node)) return result;
          injected++; if (defect === 'absent') return null;
          if (defect === 'truncated') return result.slice(0, -2);
          if (defect === 'trailing') return `${result}00`;
          let bytes = Buffer.from(result.slice(2), 'hex'); const rootOffset = bytes.length - 73;
          if (defect === 'unknown event' || defect === 'duplicate root') {
            const extra = defect === 'duplicate root' ? bytes.subarray(rootOffset) : Buffer.from('0001000000ffff00', 'hex');
            bytes[0]! += 4; bytes = Buffer.concat([bytes.subarray(0, rootOffset), extra, bytes.subarray(rootOffset)]);
          } else if (defect === 'noncanonical count') bytes = Buffer.concat([Buffer.from([bytes[0]! + 1, 0]), bytes.subarray(1)]);
          else if (defect.startsWith('root ')) {
            const index = ({ 'root phase': 0, 'root pallet': 1, 'root variant': 2, 'root format': 3,
              'root Ethereum hash': 4, 'root hash': 36, 'root count': 68, 'root topics': 72 } as Record<string, number>)[defect]!;
            bytes[rootOffset + index]! ^= 1;
          } else {
            const position = defect === 'outer count' ? 0 : defect === 'success index' ? 2 : defect === 'success class' ? 10
              : defect === 'success fee' ? 11 : defect === 'fee count' ? 19
                : defect === 'EVM address' ? 13 + 44 * 3 + 7
                  : defect === 'Ethereum from' ? rootOffset - 95 + 7 : rootOffset - 95 + 79;
            bytes[position]! ^= 1;
          }
          return `0x${bytes.toString('hex')}`;
        };
        await expect(collectFederatedNativeBurnCommitmentV1(attempt, SIDECHAIN, withdrawalAuthorize)).rejects.toThrow(/native burn/);
        expect(injected).toBe(1); expect(writes()).toEqual(before);
      });

    it.each([COMMITMENT_KEY, LEAVES_KEY, EVENTS_KEY])(`rejects custody disposal after read %s on ${node}`, async key => {
      const attempt = await observedBurn(), before = writes(); let injected = 0;
      fault = (method, params, result, url) => {
        if (method === 'state_getStorage' && params[0] === key && url.endsWith(node)) { injected++; active = false; }
        return result;
      };
      await expect(collectFederatedNativeBurnCommitmentV1(attempt, SIDECHAIN, withdrawalAuthorize)).rejects.toThrow(/custody disposed/);
      expect(injected).toBe(1); expect(writes()).toEqual(before);
    });

    it(`rechecks ${node} canonical native head after collecting runtime events`, async () => {
      const attempt = await observedBurn(), before = writes(); let collected = false, injected = 0;
      fault = (method, params, result, url) => {
        if (method === 'state_getStorage' && params[0] === EVENTS_KEY && url.endsWith('19956')) collected = true;
        if (collected && method === 'chain_getBlockHash' && params.length === 0 && url.endsWith(node)) { injected++; return hash('99'); }
        return result;
      };
      await expect(collectFederatedNativeBurnCommitmentV1(attempt, SIDECHAIN, withdrawalAuthorize)).rejects.toThrow(/target or pool changed/);
      expect(injected).toBe(1); expect(writes()).toEqual(before);
    });
  }

  it('rejects paired event disagreement even when both event envelopes independently decode', async () => {
    const attempt = await observedBurn(), before = writes(); let injected = 0;
    fault = (method, params, result, url) => {
      if (method !== 'state_getStorage' || params[0] !== EVENTS_KEY || !url.endsWith('19956')) return result;
      injected++; const bytes = Buffer.from(result.slice(2), 'hex'); bytes[8] = 4;
      return `0x${bytes.toString('hex')}`;
    };
    await expect(collectFederatedNativeBurnCommitmentV1(attempt, SIDECHAIN, withdrawalAuthorize)).rejects.toThrow(/events disagree/);
    expect(injected).toBe(1); expect(writes()).toEqual(before);
  });

  it('rejects a changed durable burn hold during commitment observation', async () => {
    const attempt = await observedBurn(), before = writes(); let injected = 0;
    fault = (method, params, result) => {
      if (method === 'state_getStorage' && params[0] === COMMITMENT_KEY) {
        injected++; writeFileSync(holdPath('burn'), '{}');
      }
      return result;
    };
    await expect(collectFederatedNativeBurnCommitmentV1(attempt, SIDECHAIN, withdrawalAuthorize)).rejects.toThrow(/durable hold changed/);
    expect(injected).toBe(1); expect(writes()).toEqual(before);
  });

  describe('SCALE and fee event closure', () => {
    // SDK bbc435c Weight has two Compact<u64> fields. Fixed literal encodings cover
    // each wide SCALE mode independently of the adapter's decoder and the zero-weight base fixture.
    const weights = [
      ['mode2 lower', '02000100'], ['mode2 upper', 'feffffff'],
      ['mode3 four-byte lower', '0300000040'], ['mode3 four-byte upper', '03ffffffff'],
      ['mode3 five-byte lower', '070000000001'], ['mode3 six-byte lower', '0b000000000001'],
      ['mode3 seven-byte lower', '0f00000000000001'], ['mode3 eight-byte lower', '130000000000000001'],
      ['mode3 u64 maximum', '13ffffffffffffffff'],
    ] as const;
    const records = () => {
      const bytes = Buffer.from(nativeBurnStorage()[EVENTS_KEY]!.slice(2), 'hex');
      // EventRecord(Phase, RuntimeEvent, topics): timestamp; three balance events;
      // two Transfer logs; PegOut log; Ethereum Executed; success; finalization root.
      const sizes = [12, 44, 44, 44, 158, 158, 255, 83, 12, 73]; let offset = 1;
      expect(bytes[0]).toBe(sizes.length * 4);
      const result = sizes.map(size => { const part = Buffer.from(bytes.subarray(offset, offset + size)); offset += size; return part; });
      expect(offset).toBe(bytes.length); return result;
    };
    const encode = (entries: Buffer[]) => `0x${Buffer.concat([Buffer.from([entries.length * 4]), ...entries]).toString('hex')}`;
    const replaceWeight = (value: string, field: 0 | 1, bytes: Buffer, truncate = false) => {
      const original = Buffer.from(value.slice(2), 'hex'), offset = 8 + field;
      return `0x${Buffer.concat([original.subarray(0, offset), bytes, ...(truncate ? [] : [original.subarray(offset + 1)])]).toString('hex')}`;
    };
    const changeEvents = (transform: (value: string) => string) => {
      let injected = 0;
      fault = (method, params, result) => {
        if (method === 'state_getStorage' && params[0] === EVENTS_KEY) { injected++; return transform(result); }
        return result;
      };
      return () => injected;
    };
    const optionalFeeEvents = () => {
      const account = Buffer.from('a1'.repeat(20), 'hex'), amount = Buffer.alloc(16); amount.writeBigUInt64LE(1000n);
      const make = (pallet: number, event: number, ...fields: Buffer[]) => Buffer.concat([
        Buffer.from([0, 1, 0, 0, 0, pallet, event]), ...fields, Buffer.from([0]),
      ]);
      // Balances::try_mutate_account first calls System::inc_providers, then emits
      // Endowed; fungible::Balanced::deposit emits Deposit after increase_balance returns.
      return [make(0, 3, account), make(4, 0, account, amount), make(4, 7, account, amount)];
    };
    const withOptionalFees = () => { const entries = records(); entries.splice(3, 1, ...optionalFeeEvents()); return entries; };

    for (const field of [0, 1] as const) {
      it.each(weights)(`accepts %s in weight field${field}`, async (_label, encoded) => {
        const attempt = await observedBurn(), before = writes();
        const injected = changeEvents(value => replaceWeight(value, field, Buffer.from(encoded, 'hex')));
        const result = await collectFederatedNativeBurnCommitmentV1(attempt, SIDECHAIN, withdrawalAuthorize);
        expect(result.eventIndex).toBe(2); expect(result.burnLeafCount).toBe(1);
        expect(injected()).toBe(2); expect(writes()).toEqual(before);
      });

      it.each([
        ['mode1 nonminimal', 'fd00', /noncanonical SCALE/],
        ['mode2 nonminimal', 'feff0000', /noncanonical SCALE/],
        ['mode3 below threshold', '03ffffff3f', /noncanonical SCALE/],
        ['mode3 zero high byte', '070000004000', /noncanonical SCALE/],
        ['mode3 eight-byte zero high byte', '130000000000004000', /noncanonical SCALE/],
        ['mode3 u64 overflow', '17000000000000000001', /SCALE bound/],
      ] as const)(`rejects %s in weight field${field}`, async (_label, encoded, error) => {
        const attempt = await observedBurn(), before = writes();
        const injected = changeEvents(value => replaceWeight(value, field, Buffer.from(encoded, 'hex')));
        await expect(collectFederatedNativeBurnCommitmentV1(attempt, SIDECHAIN, withdrawalAuthorize)).rejects.toThrow(error);
        expect(injected()).toBe(1); expect(writes()).toEqual(before);
      });

      it.each([
        ['mode1', '01'], ['mode2', '020001'], ['mode3 four-byte', '03000000'], ['mode3 eight-byte', '1300000000000000'],
      ] as const)(`rejects truncated %s in weight field${field}`, async (_label, encoded) => {
        const attempt = await observedBurn(), before = writes();
        const injected = changeEvents(value => replaceWeight(value, field, Buffer.from(encoded, 'hex'), true));
        await expect(collectFederatedNativeBurnCommitmentV1(attempt, SIDECHAIN, withdrawalAuthorize)).rejects.toThrow(/events are truncated/);
        expect(injected()).toBe(1); expect(writes()).toEqual(before);
      });
    }

    it('accepts optional NewAccount then Endowed then Deposit before EVM logs', async () => {
      const attempt = await observedBurn(), before = writes();
      const injected = changeEvents(() => encode(withOptionalFees()));
      const result = await collectFederatedNativeBurnCommitmentV1(attempt, SIDECHAIN, withdrawalAuthorize);
      expect(result.eventIndex).toBe(2); expect(result.burnLeafCount).toBe(1);
      expect(injected()).toBe(2); expect(writes()).toEqual(before);
    });

    it.each(['NewAccount', 'Endowed', 'Deposit', 'Withdraw'] as const)('rejects duplicate %s fee events', async name => {
      const attempt = await observedBurn(), before = writes();
      const injected = changeEvents(() => {
        const entries = withOptionalFees(), index = name === 'Withdraw' ? 1 : name === 'NewAccount' ? 3 : name === 'Endowed' ? 4 : 5;
        entries.splice(index, 0, Buffer.from(entries[index]!)); return encode(entries);
      });
      await expect(collectFederatedNativeBurnCommitmentV1(attempt, SIDECHAIN, withdrawalAuthorize)).rejects.toThrow(/native burn fee/);
      expect(injected()).toBe(1); expect(writes()).toEqual(before);
    });

    it.each(['NewAccount', 'Endowed', 'Deposit'] as const)('rejects %s after the first EVM log', async name => {
      const attempt = await observedBurn(), before = writes();
      const injected = changeEvents(() => {
        const entries = withOptionalFees(), index = name === 'NewAccount' ? 3 : name === 'Endowed' ? 4 : 5;
        const moved = entries.splice(index, 1)[0]!; entries.splice(6, 0, moved); return encode(entries);
      });
      await expect(collectFederatedNativeBurnCommitmentV1(attempt, SIDECHAIN, withdrawalAuthorize)).rejects.toThrow(/native burn fee/);
      expect(injected()).toBe(1); expect(writes()).toEqual(before);
    });

    for (const name of ['NewAccount', 'Endowed', 'Deposit'] as const) {
      it.each(['phase', 'extrinsic'] as const)(`rejects wrong %s on optional ${name}`, async defect => {
        const attempt = await observedBurn(), before = writes();
        const injected = changeEvents(() => {
          const entries = withOptionalFees(), index = name === 'NewAccount' ? 3 : name === 'Endowed' ? 4 : 5;
          if (defect === 'phase') entries[index] = Buffer.concat([Buffer.from([1]), entries[index]!.subarray(5)]);
          else entries[index]!.writeUInt32LE(0, 1);
          return encode(entries);
        });
        await expect(collectFederatedNativeBurnCommitmentV1(attempt, SIDECHAIN, withdrawalAuthorize)).rejects.toThrow(/runtime event is unknown/);
        expect(injected()).toBe(1); expect(writes()).toEqual(before);
      });
      it(`rejects nonempty native topics on optional ${name}`, async () => {
        const attempt = await observedBurn(), before = writes();
        const injected = changeEvents(() => {
          const entries = withOptionalFees(), index = name === 'NewAccount' ? 3 : name === 'Endowed' ? 4 : 5;
          entries[index] = Buffer.concat([entries[index]!.subarray(0, -1), Buffer.from([4]), Buffer.alloc(32, 1)]);
          return encode(entries);
        });
        await expect(collectFederatedNativeBurnCommitmentV1(attempt, SIDECHAIN, withdrawalAuthorize)).rejects.toThrow(/SCALE bound/);
        expect(injected()).toBe(1); expect(writes()).toEqual(before);
      });
    }

    it.each(['Withdraw', 'refund Deposit', 'Endowed', 'author Deposit'] as const)('rejects %s above the signed fee bound', async name => {
      const attempt = await observedBurn(), before = writes();
      const injected = changeEvents(() => {
        const entries = withOptionalFees(), index = name === 'Withdraw' ? 1 : name === 'refund Deposit' ? 2 : name === 'Endowed' ? 4 : 5;
        entries[index]!.writeBigUInt64LE(7_119_140_625_000_001n, 27); return encode(entries);
      });
      await expect(collectFederatedNativeBurnCommitmentV1(attempt, SIDECHAIN, withdrawalAuthorize)).rejects.toThrow(/signed fee bound/);
      expect(injected()).toBe(1); expect(writes()).toEqual(before);
    });

    it.each(['too many', 'too few', 'zero', 'noncanonical'] as const)('rejects %s outer event count', async defect => {
      const attempt = await observedBurn(), before = writes();
      const injected = changeEvents(value => {
        const bytes = Buffer.from(value.slice(2), 'hex');
        if (defect === 'noncanonical') return `0x${Buffer.concat([Buffer.from([bytes[0]! + 1, 0]), bytes.subarray(1)]).toString('hex')}`;
        bytes[0] = defect === 'too many' ? 17 * 4 : defect === 'too few' ? bytes[0]! - 4 : 0;
        return `0x${bytes.toString('hex')}`;
      });
      await expect(collectFederatedNativeBurnCommitmentV1(attempt, SIDECHAIN, withdrawalAuthorize)).rejects.toThrow(/native burn runtime/);
      expect(injected()).toBe(1); expect(writes()).toEqual(before);
    });
  });
});

describe('native FED mint execution consumer', () => {
  it.each([1_000_000_000n, 1_125_000_001n])('rejects a valid signature at gas price %s before transport', async gasPrice => {
    let signer: HDNodeWallet | undefined;
    const original = HDNodeWallet.prototype.signTransaction;
    vi.spyOn(HDNodeWallet.prototype, 'signTransaction').mockImplementation(function (this: HDNodeWallet, tx) {
      signer = this; return original.call(this, tx);
    });
    await prepare();
    const hold = readFileSync(join(directory, 'native-mint-attempt.json'), 'utf8');
    const tx = Transaction.from(mint.signedTransactionHex);
    const signedTransactionHex = await original.call(signer!, { type: tx.type, chainId: tx.chainId,
      nonce: tx.nonce, to: tx.to, value: tx.value, data: tx.data, gasLimit: tx.gasLimit, gasPrice });
    const changed = Transaction.from(signedTransactionHex);
    expect(changed.from).toBe(tx.from); expect(changed.signature?.isValid()).toBe(true);
    const before = [...calls];
    expect(() => reserveFederatedNativeMintAttemptV1(directory, context, { signedTransactionHex,
      transactionHashHex: changed.hash!, nativeExtrinsicHex: encodeFederatedNativeMintExtrinsicV1Hex(signedTransactionHex) }))
      .toThrow('native mint bytes differ from the reserved application');
    expect(calls).toEqual(before);
    expect(readFileSync(join(directory, 'native-mint-attempt.json'), 'utf8')).toBe(hold);
  });

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

describe('native FED approve/burn execution component consumer', () => {
  it('joins completed mint, real approval and burn signatures, exact holds and OZ5 net/fee state', async () => {
    let context: FederatedNativeWithdrawalContextV1 = await completedMint();
    for (const phase of ['approve', 'burn'] as const) {
      const before = [...writes()], signed = await signWithdrawal(context);
      expect(writes()).toEqual(before); expect(existsSync(holdPath(phase))).toBe(false);
      const tx = Transaction.from(signed.signedTransactionHex), nonce = phase === 'approve' ? 2 : 3;
      expect(tx.signature?.isValid()).toBe(true); expect(tx.signature?.networkV).not.toBeNull();
      expect(tx.hash).toBe(signed.transactionHashHex); expect(tx.from?.toLowerCase()).toBe(`0x${owner.addressHex}`);
      expect(tx).toMatchObject({ type: 0, chainId: 4242n, nonce, value: 0n, gasLimit: 5000000n,
        gasPrice: phase === 'approve' ? 1265625000n : 1423828125n });
      expect(tx.to?.toLowerCase()).toBe(phase === 'approve' ? TOKEN : BRIDGE);
      expect(tx.data).toBe(phase === 'approve' ? ABI.encodeFunctionData('approve', [BRIDGE, 15000000n])
        : ABI.encodeFunctionData('pegOut', [15000000n, RECIPIENT]));
      const attempt = reserveFederatedNativeWithdrawalAttemptV1(context, signed);
      expect(Object.isFrozen(attempt)).toBe(true); expect(writes()).toEqual(before);
      const hold = readFileSync(holdPath(phase), 'utf8');
      expect(await executeWithdrawal(attempt)).toEqual({ phase, blockHashHex: NATIVE_BLOCKS[nonce + 1],
        ethereumBlockHashHex: ETH_BLOCKS[nonce + 1], blockHeight: nonce + 1, transactionHashHex: signed.transactionHashHex,
        transactionIndex: 0, eventIndex: phase === 'approve' ? 0 : 2, grossAmountNanoErg: '15000000', netAmountNanoErg: '10000000',
        recipientErgoTreeHex: RECIPIENT, sourceFinalityEstablished: false, trustless: false });
      expect(readFileSync(holdPath(phase), 'utf8')).toBe(hold);
      expect(writes().slice(before.length)).toEqual(['eth_sendRawTransaction', 'engine_createBlock']);
      await expect(submitFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize)).rejects.toThrow(/consumed/);
      await expect(sealFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize)).rejects.toThrow(/not available/);
      expect(() => reserveFederatedNativeWithdrawalAttemptV1(context, signed)).toThrow(/claimed/);
      context = { ...context, approvalAttempt: attempt };
    }
    expect(height).toBe(4); expect(writes().filter(method => method === 'eth_sendRawTransaction')).toHaveLength(3);
  });

  it.each(['reserved', 'submitted', 'sealed', 'inclusion observed'] as const)
    ('requires terminal mint storage, not merely a %s mint', async stage => {
      const mintAttempt = await prepare();
      if (stage !== 'reserved') await submitFederatedNativeMintV1(mintAttempt, authorize);
      if (stage === 'sealed' || stage === 'inclusion observed') await sealFederatedNativeMintV1(mintAttempt, authorize);
      if (stage === 'inclusion observed') await observeFederatedNativeMintInclusionV1(mintAttempt, authorize);
      const input = { mintAttempt, approvalAttempt: null, grossAmountNanoErg: '15000000', recipientErgoTreeHex: RECIPIENT };
      const before = [...calls];
      await expect(observeFederatedNativeWithdrawalParentV1(input, withdrawalAuthorize)).rejects.toThrow(/confirmed mint state/);
      expect(() => reserveFederatedNativeWithdrawalAttemptV1(input, mintAttempt)).toThrow(/confirmed mint state/);
      expect(calls).toEqual(before); expect(existsSync(holdPath('approve'))).toBe(false);
    });

  it.each(['reserved', 'submitted', 'sealed'] as const)('requires observed approval, not a %s handle', async stage => {
    const { context, attempt } = await prepareWithdrawal('approve');
    if (stage !== 'reserved') await submitFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize);
    if (stage === 'sealed') await sealFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize);
    const burn = { ...context, approvalAttempt: attempt }, before = [...calls];
    await expect(observeFederatedNativeWithdrawalParentV1(burn, withdrawalAuthorize)).rejects.toThrow(/approval lineage/);
    expect(() => reserveFederatedNativeWithdrawalAttemptV1(burn, attempt)).toThrow(/approval lineage/);
    expect(calls).toEqual(before); expect(existsSync(holdPath('burn'))).toBe(false);
  });

  it.each(['mint copy', 'approval copy', 'recipient', 'burn as approval'] as const)('rejects changed lineage: %s', async defect => {
    const context = await withdrawalContext('burn');
    let changed = { ...context };
    if (defect === 'mint copy') changed.mintAttempt = { ...context.mintAttempt };
    if (defect === 'approval copy') changed.approvalAttempt = { ...context.approvalAttempt! };
    if (defect === 'recipient') changed.recipientErgoTreeHex = OTHER_RECIPIENT;
    if (defect === 'burn as approval') {
      const burn = reserveFederatedNativeWithdrawalAttemptV1(context, await signWithdrawal(context));
      await executeWithdrawal(burn); changed.approvalAttempt = burn;
    }
    const before = [...calls];
    await expect(observeFederatedNativeWithdrawalParentV1(changed, withdrawalAuthorize)).rejects.toThrow(/not original|approval lineage/);
    expect(calls).toEqual(before);
  });

  it('rejects an original approval from a different original completed mint handle', async () => {
    const original = await completedMint();
    const foreign = reserveFederatedNativeMintAttemptV1(mkdtempSync(join(directory, 'foreign-mint-')), context, original.mintAttempt);
    withdrawalMode = false; height = 1; mintSubmitted = false;
    await execute(foreign); withdrawalMode = true;
    const approvalAttempt = reserveFederatedNativeWithdrawalAttemptV1(original, await signWithdrawal(original));
    await executeWithdrawal(approvalAttempt);
    const before = [...calls];
    await expect(observeFederatedNativeWithdrawalParentV1({ ...original, mintAttempt: foreign, approvalAttempt }, withdrawalAuthorize))
      .rejects.toThrow(/approval lineage/);
    expect(calls).toEqual(before);
  });

  it('binds burn gross amount to approval even when both amounts fit the completed mint', async () => {
    context = { ...context, amountNanoErg: '20000000' };
    const original = await withdrawalContext('burn');
    const changed = { ...original, grossAmountNanoErg: '16000000' }, before = [...calls];
    await expect(observeFederatedNativeWithdrawalParentV1(changed, withdrawalAuthorize)).rejects.toThrow(/approval lineage/);
    expect(() => reserveFederatedNativeWithdrawalAttemptV1(changed, original.approvalAttempt!)).toThrow(/approval lineage/);
    expect(calls).toEqual(before); expect(existsSync(holdPath('burn'))).toBe(false);
  });

  for (const phase of ['approve', 'burn'] as const) {
    describe(phase, () => {
      it.each(['amount below minimum', 'amount above mint', 'noncanonical amount', 'recipient bytes', 'invalid curve point'] as const)
        ('rejects malformed context %s without a hold or transport', async defect => {
          const context = await withdrawalContext(phase);
          const changed = { ...context };
          if (defect === 'amount below minimum') changed.grossAmountNanoErg = '14999999';
          if (defect === 'amount above mint') changed.grossAmountNanoErg = '15000001';
          if (defect === 'noncanonical amount') changed.grossAmountNanoErg = '015000000';
          if (defect === 'recipient bytes') changed.recipientErgoTreeHex += '00';
          if (defect === 'invalid curve point') changed.recipientErgoTreeHex = `0x0008cd02${'ff'.repeat(32)}`;
          const before = [...calls];
          await expect(observeFederatedNativeWithdrawalParentV1(changed, withdrawalAuthorize)).rejects.toThrow();
          expect(() => reserveFederatedNativeWithdrawalAttemptV1(changed, context.mintAttempt)).toThrow();
          expect(calls).toEqual(before); expect(existsSync(holdPath(phase))).toBe(false);
        });

      it.each(['copied', 'mint handle', 'cold module'] as const)('rejects %s withdrawal authority', async defect => {
        const { attempt, context } = await prepareWithdrawal(phase);
        const before = [...calls], hold = readFileSync(holdPath(phase), 'utf8');
        if (defect === 'cold module') {
          vi.resetModules(); const cold = await import('./federated-native-reservation-execution-v1.js');
          await expect(cold.submitFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize)).rejects.toThrow(/not original/);
          await expect(cold.sealFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize)).rejects.toThrow(/not original/);
          await expect(cold.observeFederatedNativeWithdrawalInclusionV1(attempt, withdrawalAuthorize)).rejects.toThrow(/not original/);
        } else {
          const foreign = defect === 'copied' ? { ...attempt } : context.mintAttempt;
          await expect(submitFederatedNativeWithdrawalV1(foreign, withdrawalAuthorize)).rejects.toThrow(/not original/);
          await expect(sealFederatedNativeWithdrawalV1(foreign, withdrawalAuthorize)).rejects.toThrow(/not original/);
          await expect(observeFederatedNativeWithdrawalInclusionV1(foreign, withdrawalAuthorize)).rejects.toThrow(/not original/);
        }
        expect(calls).toEqual(before); expect(readFileSync(holdPath(phase), 'utf8')).toBe(hold);
      });

      it.each(['transaction hash', 'native extrinsic'] as const)('rejects a detached %s before reserving', async defect => {
        const context = await withdrawalContext(phase), signed = await signWithdrawal(context);
        const detached = Buffer.from(signed.nativeExtrinsicHex.slice(2), 'hex'); detached[detached.length - 1] ^= 1;
        const changed = { ...signed, [defect === 'transaction hash' ? 'transactionHashHex' : 'nativeExtrinsicHex']:
          defect === 'transaction hash' ? hash('77') : `0x${detached.toString('hex')}` };
        expect(changed).not.toEqual(signed);
        const before = [...calls];
        expect(() => reserveFederatedNativeWithdrawalAttemptV1(context, changed))
          .toThrow(defect === 'transaction hash' ? /bytes differ/ : /extrinsic differs from the signed transaction/);
        expect(calls).toEqual(before); expect(existsSync(holdPath(phase))).toBe(false);
        const attempt = reserveFederatedNativeWithdrawalAttemptV1(context, signed);
        expect(attempt).toEqual(signed);
        expect(JSON.parse(readFileSync(holdPath(phase), 'utf8'))).toMatchObject(signed);
        expect(calls).toEqual(before);
      });

      it('never overwrites a pre-existing hold or reclaims the failed reservation slot', async () => {
        const context = await withdrawalContext(phase), signed = await signWithdrawal(context);
        const hold = '{"fixture":"pre-existing hold"}'; writeFileSync(holdPath(phase), hold);
        const before = [...calls];
        expect(() => reserveFederatedNativeWithdrawalAttemptV1(context, signed)).toThrow(/EEXIST/);
        expect(() => reserveFederatedNativeWithdrawalAttemptV1(context, signed)).toThrow(/claimed/);
        expect(readFileSync(holdPath(phase), 'utf8')).toBe(hold); expect(calls).toEqual(before);
      });

      it.each(['context', 'signed'] as const)('claims only one hold during %s inspection reentry', async surface => {
        const context = await withdrawalContext(phase), signed = await signWithdrawal(context);
        let nested: WithdrawalAttempt | undefined;
        const trap: ProxyHandler<object> = { getPrototypeOf(target) {
          nested ??= reserveFederatedNativeWithdrawalAttemptV1(context, signed);
          return Reflect.getPrototypeOf(target);
        } };
        const before = [...calls];
        const candidateContext = surface === 'context' ? new Proxy<typeof context>(context, trap) : context;
        const candidateSigned = surface === 'signed' ? new Proxy<typeof signed>(signed, trap) : signed;
        expect(() => reserveFederatedNativeWithdrawalAttemptV1(candidateContext, candidateSigned)).toThrow(/already claimed/);
        expect(nested).toEqual(signed); expect(calls).toEqual(before);
        const hold = readFileSync(holdPath(phase), 'utf8');
        expect(JSON.parse(hold)).toMatchObject(signed);
        await executeWithdrawal(nested!);
        expect(readFileSync(holdPath(phase), 'utf8')).toBe(hold);
      });

      it.each(['outer length', 'version prefix', 'pallet', 'call', 'transaction variant', 'nonce', 'gas price', 'gas limit',
        'target variant', 'target', 'value', 'data length', 'data', 'v', 'r', 's', 'signature tail', 'trailing bytes'] as const)
        ('rejects isolated native %s mismatch before hold/claim and retains the valid slot', async field => {
          const context = await withdrawalContext(phase), signed = await signWithdrawal(context);
          const tx = Transaction.from(signed.signedTransactionHex);
          const original = Buffer.from(signed.nativeExtrinsicHex.slice(2), 'hex');
          const data = Buffer.from(tx.data.slice(2), 'hex');
          expect(data.length).toBe(phase === 'approve' ? 68 : 164);
          expect(original.length).toBe(phase === 'approve' ? 297 : 393);
          // Two-byte outer and calldata SCALE lengths in the pinned bare-v5 legacy call.
          const signature = 157 + data.length;
          expect(original.subarray(157, signature)).toEqual(data);
          const offsets: Record<string, number> = { 'outer length': 0, 'version prefix': 2, pallet: 3, call: 4,
            'transaction variant': 5, nonce: 6, 'gas price': 38, 'gas limit': 70, 'target variant': 102,
            target: 103, value: 123, 'data length': 155, data: 157, v: signature,
            r: signature + 8, s: signature + 40, 'signature tail': original.length - 1 };
          let changed = Buffer.from(original);
          if (field === 'trailing bytes') changed = Buffer.concat([changed, Buffer.from([0])]);
          else {
            changed[offsets[field]] ^= 1;
            expect([...changed].filter((byte, index) => byte !== original[index])).toHaveLength(1);
          }
          const before = [...calls];
          expect(() => reserveFederatedNativeWithdrawalAttemptV1(context, { ...signed, nativeExtrinsicHex: `0x${changed.toString('hex')}` }))
            .toThrow(/extrinsic differs from the signed transaction/);
          expect(calls).toEqual(before); expect(existsSync(holdPath(phase))).toBe(false);
          const attempt = reserveFederatedNativeWithdrawalAttemptV1(context, signed);
          expect(attempt).toEqual(signed);
          expect(JSON.parse(readFileSync(holdPath(phase), 'utf8'))).toMatchObject(signed);
          expect(calls).toEqual(before);
        });

      it.each(['eth_call', 'eth_sendRawTransaction', 'engine_createBlock'])
        ('retains the hold and sanitizes a standard %s RPC error', async selectedMethod => {
          const { attempt } = await prepareWithdrawal(phase);
          const hold = readFileSync(holdPath(phase), 'utf8'), before = [...writes()];
          const originalFetch = globalThis.fetch;
          vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
            const response = await originalFetch(url, init);
            if (JSON.parse(init.body as string).method !== selectedMethod) return response;
            return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1,
              error: { code: -32603, message: 'untrusted withdrawal diagnostic', data: { detail: 'untrusted withdrawal response' } } }));
          }));
          const error = await executeWithdrawal(attempt).catch(error => error);
          expect(error).toBeInstanceOf(Error);
          expect(error.message).toBe(`native reservation RPC ${selectedMethod} rejected (code -32603); attempt remains held`);
          expect(error.cause).toBeUndefined();
          await expect(submitFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize)).rejects.toThrow(/consumed/);
          await expect(sealFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize)).rejects.toThrow(/not available/);
          await expect(observeFederatedNativeWithdrawalInclusionV1(attempt, withdrawalAuthorize)).rejects.toThrow(/not sealed/);
          expect(writes().slice(before.length)).toEqual(selectedMethod === 'eth_call' ? []
            : selectedMethod === 'eth_sendRawTransaction' ? ['eth_sendRawTransaction'] : ['eth_sendRawTransaction', 'engine_createBlock']);
          expect(readFileSync(holdPath(phase), 'utf8')).toBe(hold);
        });

      it.each(['type', 'chainId', 'nonce', 'value', 'low price', 'high price', 'gasLimit', 'to', 'signer', 'amount', 'destination'] as const)
        ('rejects independently re-signed %s mismatch before reservation', async defect => {
          let signer: HDNodeWallet | undefined;
          const original = HDNodeWallet.prototype.signTransaction;
          vi.spyOn(HDNodeWallet.prototype, 'signTransaction').mockImplementation(function (this: HDNodeWallet, tx) {
            signer = this; return original.call(this, tx);
          });
          const context = await withdrawalContext(phase), signed = await signWithdrawal(context);
          const tx = Transaction.from(signed.signedTransactionHex);
          const input = { type: tx.type, chainId: tx.chainId, nonce: tx.nonce, value: tx.value, gasPrice: tx.gasPrice!,
            gasLimit: tx.gasLimit, to: tx.to, data: tx.data };
          if (defect === 'type') input.type = 1;
          if (defect === 'chainId') input.chainId = 4243n;
          if (defect === 'nonce') input.nonce++;
          if (defect === 'value') input.value = 1n;
          if (defect === 'low price') input.gasPrice--;
          if (defect === 'high price') input.gasPrice++;
          if (defect === 'gasLimit') input.gasLimit--;
          if (defect === 'to') input.to = phase === 'approve' ? BRIDGE : TOKEN;
          if (defect === 'amount' || defect === 'destination') input.data = phase === 'approve'
            ? ABI.encodeFunctionData('approve', [defect === 'destination' ? TOKEN : BRIDGE, defect === 'amount' ? 15000001n : 15000000n])
            : ABI.encodeFunctionData('pegOut', [defect === 'amount' ? 15000001n : 15000000n, defect === 'destination' ? OTHER_RECIPIENT : RECIPIENT]);
          const bytes = await original.call(defect === 'signer' ? HDNodeWallet.createRandom() : signer!, input);
          const changed = Transaction.from(bytes); expect(changed.signature?.isValid()).toBe(true);
          if (defect === 'signer') expect(changed.from).not.toBe(tx.from);
          else expect(changed.from).toBe(tx.from);
          const before = [...calls];
          if (defect === 'type') expect(() => encodeFederatedNativeMintExtrinsicV1Hex(bytes)).toThrow(/legacy transaction must be canonical RLP/);
          else {
            const candidate = { signedTransactionHex: bytes, transactionHashHex: changed.hash!,
              nativeExtrinsicHex: encodeFederatedNativeMintExtrinsicV1Hex(bytes) };
            expect(() => reserveFederatedNativeWithdrawalAttemptV1(context, candidate)).toThrow(/bytes differ/);
          }
          expect(calls).toEqual(before); expect(existsSync(holdPath(phase))).toBe(false);
        });

      for (const stage of ['submit', 'seal', 'observe'] as const) {
        it.each(['own', 'mint', 'reservation', ...(phase === 'burn' ? ['approval'] : [])])
          (`rejects tampered %s journal at ${stage}`, async journal => {
            const { attempt } = await prepareWithdrawal(phase);
            if (stage !== 'submit') await submitFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize);
            if (stage === 'observe') await sealFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize);
            const path = journal === 'own' ? holdPath(phase) : join(directory, `native-${journal === 'approval' ? 'approve' : journal}-attempt.json`);
            const bytes = readFileSync(path, 'utf8');
            writeFileSync(path, bytes.replace('reserved', 'tampered'));
            expect(Buffer.byteLength(readFileSync(path, 'utf8'))).toBe(Buffer.byteLength(bytes));
            const before = [...calls];
            const action = stage === 'submit' ? submitFederatedNativeWithdrawalV1 : stage === 'seal'
              ? sealFederatedNativeWithdrawalV1 : observeFederatedNativeWithdrawalInclusionV1;
            await expect(action(attempt, withdrawalAuthorize)).rejects.toThrow(/hold changed/);
            expect(calls).toEqual(before);
          });

        it.each(['absent', 'denied', 'disposed'] as const)(`requires separate %s authorization for ${stage}`, async defect => {
          const { attempt } = await prepareWithdrawal(phase);
          if (stage !== 'submit') await submitFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize);
          if (stage === 'observe') await sealFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize);
          if (defect === 'disposed') disposeFederatedGenesisOperatorV1(owner);
          const before = [...calls], hold = readFileSync(holdPath(phase), 'utf8');
          const action = stage === 'submit' ? submitFederatedNativeWithdrawalV1 : stage === 'seal'
            ? sealFederatedNativeWithdrawalV1 : observeFederatedNativeWithdrawalInclusionV1;
          await expect(action(attempt, defect === 'absent' ? undefined as never : defect === 'denied'
            ? () => { throw new Error('test transport authorization denied'); } : withdrawalAuthorize)).rejects.toThrow();
          expect(calls).toEqual(before); expect(readFileSync(holdPath(phase), 'utf8')).toBe(hold);
        });
      }

      for (const stage of ['submit', 'seal'] as const) {
        it.each(['Ethereum hash', 'Ethereum number', 'Ethereum transactions', 'hash mapping', 'hash number', 'hash transactions',
          'fee ceiling', 'fee encoding', 'fee missing', 'fee U256 overflow', 'fee U256 maximum',
          'chain', 'Ethereum nonce', 'native nonce', 'native account encoding',
          'genesis', 'reservation ancestor', 'mint ancestor', ...(phase === 'burn' ? ['approval ancestor'] : []),
          'head', 'pool foreign', 'pool duplicate', ...(stage === 'seal' ? ['pool missing primary'] : [])])
          (`rejects ${stage} parent %s before transport`, async defect => {
            const { attempt } = await prepareWithdrawal(phase);
            if (stage === 'seal') await submitFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize);
            const before = [...writes()], hold = readFileSync(holdPath(phase), 'utf8'); let injected = 0;
            fault = (method, params, result, url) => {
              if (!url.endsWith(defect === 'pool missing primary' ? '19955' : '19956')) return result;
              let changed: unknown = result;
              if (method === 'eth_getBlockByNumber') {
                if (defect === 'Ethereum hash') changed = { ...result, hash: hash('77') };
                if (defect === 'Ethereum number') changed = { ...result, number: '0x1' };
                if (defect === 'Ethereum transactions') changed = { ...result, transactions: [hash('77')] };
                if (defect === 'fee ceiling') changed = { ...result, baseFeePerGas: quantity((phase === 'approve' ? 1125000000n : 1265625000n) + 1n) };
                if (defect === 'fee encoding') changed = { ...result, baseFeePerGas: `0x0${result.baseFeePerGas.slice(2)}` };
                if (defect === 'fee missing') { changed = { ...result }; delete (changed as any).baseFeePerGas; }
                if (defect === 'fee U256 overflow') changed = { ...result, baseFeePerGas: quantity(1n << 256n) };
                if (defect === 'fee U256 maximum') changed = { ...result, baseFeePerGas: quantity((1n << 256n) - 1n) };
              }
              if (method === 'eth_getBlockByHash') {
                if (defect === 'hash mapping') changed = { ...result, hash: hash('77') };
                if (defect === 'hash number') changed = { ...result, number: '0x1' };
                if (defect === 'hash transactions') changed = { ...result, transactions: [hash('77')] };
              }
              if (defect === 'chain' && method === 'eth_chainId') changed = '0x1093';
              if (defect === 'Ethereum nonce' && method === 'eth_getTransactionCount') changed = '0x1';
              if (method === 'state_getStorage' && params[0] === owner.nativeFunding.storageKeyHex) {
                if (defect === 'native account encoding') changed = `${result}00`;
                if (defect === 'native nonce') {
                  const account = Buffer.from(result.slice(2), 'hex'); account.writeUInt32LE(1); changed = `0x${account.toString('hex')}`;
                }
              }
              if (method === 'chain_getBlockHash') {
                const ancestors: Record<string, number> = { genesis: 0, 'reservation ancestor': 1, 'mint ancestor': 2, 'approval ancestor': 3 };
                if (Object.hasOwn(ancestors, defect) && params[0] === ancestors[defect] || defect === 'head' && params.length === 0) changed = hash('77');
              }
              if (method === 'author_pendingExtrinsics') {
                if (defect === 'pool foreign') changed = ['0x1005010028'];
                if (defect === 'pool duplicate') changed = [attempt.nativeExtrinsicHex, attempt.nativeExtrinsicHex];
                if (defect === 'pool missing primary') changed = [];
              }
              if (changed !== result) injected++;
              return changed;
            };
            const action = stage === 'submit' ? submitFederatedNativeWithdrawalV1 : sealFederatedNativeWithdrawalV1;
            await expect(action(attempt, withdrawalAuthorize)).rejects.toThrow(/differs|changed/);
            expect(injected).toBe(1); expect(writes()).toEqual(before);
            expect(readFileSync(holdPath(phase), 'utf8')).toBe(hold);
            await expect(action(attempt, withdrawalAuthorize)).rejects.toThrow(/consumed|not available/);
          });

        it.each(['ambiguous', 'transport failure', 'concurrent', 'disposal during observation', 'disposal at last read'] as const)
          (`holds ${stage} after %s without another transport`, async defect => {
            const { attempt } = await prepareWithdrawal(phase);
            if (stage === 'seal') await submitFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize);
            const action = stage === 'submit' ? submitFederatedNativeWithdrawalV1 : sealFederatedNativeWithdrawalV1;
            const methodSelected = stage === 'submit' ? 'eth_sendRawTransaction' : 'engine_createBlock';
            const before = [...writes()], hold = readFileSync(holdPath(phase), 'utf8');
            let parallel: Promise<unknown> | undefined;
            fault = (method, params, result, url) => {
              if (defect === 'disposal during observation' && method === 'eth_getBlockByNumber') disposeFederatedGenesisOperatorV1(owner);
              if (defect === 'disposal at last read' && method === 'chain_getBlockHash' && params.length === 0 && url.endsWith('19956')) {
                disposeFederatedGenesisOperatorV1(owner);
              }
              if (method === methodSelected) {
                if (defect === 'ambiguous') return stage === 'submit' ? hash('77') : { hash: NATIVE_BLOCKS[height - 1] };
                if (defect === 'transport failure') throw new Error('synthetic withdrawal transport failure');
                if (defect === 'concurrent') parallel = expect(action(attempt, withdrawalAuthorize)).rejects.toThrow(/consumed|not available/);
              }
              return result;
            };
            if (defect === 'concurrent') { await action(attempt, withdrawalAuthorize); await parallel; }
            else await expect(action(attempt, withdrawalAuthorize)).rejects.toThrow(/ambiguous|predecessor|failure|disposed/);
            await expect(action(attempt, withdrawalAuthorize)).rejects.toThrow(/consumed|not available/);
            expect(writes().slice(before.length)).toEqual(defect.startsWith('disposal') ? [] : [methodSelected]);
            expect(readFileSync(holdPath(phase), 'utf8')).toBe(hold);
            if (stage === 'submit' && defect !== 'concurrent') await expect(sealFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize))
              .rejects.toThrow(/not available/);
          });
      }

      it.each(['zero', 'fractional growth', 'exact ceiling'] as const)('accepts bounded parent fee: %s', async boundary => {
        const context = await withdrawalContext(phase), before = [...writes()]; let observed = 0;
        const limit = phase === 'approve' ? 1125000000n : 1265625000n;
        const baseFee = boundary === 'zero' ? 0n : boundary === 'fractional growth' ? limit - 1n : limit;
        expect((baseFee * 9n + 7n) / 8n).toBeLessThanOrEqual(phase === 'approve' ? 1265625000n : 1423828125n);
        fault = (method, _params, result) => {
          if (method === 'eth_getBlockByNumber') { observed++; return { ...result, baseFeePerGas: quantity(baseFee) }; }
          return result;
        };
        await expect(observeFederatedNativeWithdrawalParentV1(context, withdrawalAuthorize)).resolves.toEqual({
          nonce: phase === 'approve' ? 2 : 3, parentNativeHeight: phase === 'approve' ? 2 : 3,
        });
        expect(observed).toBe(2); expect(writes()).toEqual(before); expect(existsSync(holdPath(phase))).toBe(false);
      });

      for (const stage of ['submit', 'seal', 'observe'] as const) {
        it.each(['bridge code hash', 'token code hash', 'bridge code size', 'token code size',
          'bridge owner', 'token owner', 'sergToken', 'paused', 'totalSupply', 'operator balance', 'bridge balance',
          'allowance', 'accumulatedFees', 'processedPegIns', 'profile storage', 'pending index', 'pending reservation',
          'consumed reservation', 'invalidated reservation'])
          (`rejects ${stage} application/conservation fault: %s`, async defect => {
            const { attempt } = await prepareWithdrawal(phase);
            if (stage !== 'submit') await submitFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize);
            if (stage === 'observe') await sealFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize);
            const before = [...writes()]; let injected = 0;
            fault = (method, params, result, url) => {
              if (!url.endsWith('19956')) return result;
              if (method === 'eth_getCode' && defect.includes('code') && params[0] === (defect.startsWith('bridge') ? BRIDGE : TOKEN)) {
                injected++; return defect.endsWith('size') ? '0x600000' : '0x6001';
              }
              if (method === 'eth_call') {
                const request = params[0] as any, call = ABI.parseTransaction({ data: request.data })!;
                const selected = defect === 'bridge owner' ? call.name === 'owner' && request.to === BRIDGE
                  : defect === 'token owner' ? call.name === 'owner' && request.to === TOKEN
                    : defect === 'operator balance' ? call.name === 'balanceOf' && call.args[0].toLowerCase() === `0x${owner.addressHex}`
                      : defect === 'bridge balance' ? call.name === 'balanceOf' && call.args[0].toLowerCase() === BRIDGE : call.name === defect;
                if (selected) {
                  const value = ABI.decodeFunctionResult(call.name, result)[0]; injected++;
                  return ABI.encodeFunctionResult(call.name, [typeof value === 'boolean' ? !value : typeof value === 'bigint' ? value + 1n : ZERO]);
                }
              }
              const keys: Record<string, string> = { 'profile storage': '0x01', 'pending index': '0x04', 'pending reservation': '0x05',
                'consumed reservation': '0x06', 'invalidated reservation': '0x07' };
              if (method === 'state_getStorage' && params[0] === keys[defect]) { injected++; return result === null ? '0x01' : null; }
              return result;
            };
            const action = stage === 'submit' ? submitFederatedNativeWithdrawalV1 : stage === 'seal'
              ? sealFederatedNativeWithdrawalV1 : observeFederatedNativeWithdrawalInclusionV1;
            await expect(action(attempt, withdrawalAuthorize)).rejects.toThrow(/code differs|state differs/);
            expect(injected).toBe(1); expect(writes()).toEqual(before);
          });
      }

      it.each(['native hash', 'native call', 'native parent', 'native number', 'native extra call', 'native timestamp', 'native disagreement',
        'Ethereum hash', 'Ethereum number', 'Ethereum parent', 'Ethereum transactions', 'hash mapping', 'head'])
        ('rejects child identity fault: %s', async defect => {
          const { attempt } = await prepareWithdrawal(phase);
          await submitFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize); await sealFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize);
          const before = [...writes()]; let injected = 0;
          fault = (method, params, result, url) => {
            if (!url.endsWith('19956')) return result;
            if (method === 'chain_getBlockHash' && (defect === 'native hash' && params[0] === height || defect === 'head' && params.length === 0)) {
              injected++; return hash('77');
            }
            if (method === 'chain_getBlock') {
              if (defect === 'native call') { injected++; result.block.extrinsics[1] += '00'; }
              if (defect === 'native parent') { injected++; result.block.header.parentHash = GENESIS; }
              if (defect === 'native number') { injected++; result.block.header.number = '0x1'; }
              if (defect === 'native extra call') { injected++; result.block.extrinsics.push('0x1005010028'); }
              if (defect === 'native timestamp') { injected++; result.block.extrinsics[0] = '0x1005010029'; }
              if (defect === 'native disagreement') { injected++; result.block.header.stateRoot = hash('77'); }
            }
            if (method === 'eth_getBlockByNumber') {
              const fields: Record<string, [string, unknown]> = { 'Ethereum hash': ['hash', hash('77')], 'Ethereum number': ['number', '0x1'],
                'Ethereum parent': ['parentHash', ETH_PARENT], 'Ethereum transactions': ['transactions', [hash('77')]] };
              if (fields[defect]) { injected++; result[fields[defect][0]] = fields[defect][1]; }
            }
            if (method === 'eth_getBlockByHash' && defect === 'hash mapping') { injected++; result.hash = hash('77'); }
            return result;
          };
          await expect(observeFederatedNativeWithdrawalInclusionV1(attempt, withdrawalAuthorize)).rejects.toThrow(/differs|divergent|disagree|changed/);
          expect(injected).toBe(1); expect(writes()).toEqual(before);
        });

      it.each(['transactionHash', 'blockHash', 'blockNumber', 'transactionIndex', 'status', 'from', 'to', 'missing log', 'extra log'])
        ('rejects exact receipt %s mismatch', async field => {
          const { attempt } = await prepareWithdrawal(phase);
          await submitFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize); await sealFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize);
          const before = [...writes()]; let injected = 0;
          fault = (method, _params, result, url) => {
            if (method !== 'eth_getTransactionReceipt' || !url.endsWith('19956')) return result;
            injected++;
            const replacements: Record<string, unknown> = { transactionHash: hash('77'), blockHash: ETH_PARENT, blockNumber: '0x1',
              transactionIndex: '0x1', status: '0x0', from: ZERO, to: ZERO };
            if (field === 'missing log') result.logs.pop();
            else if (field === 'extra log') result.logs.push({ ...result.logs[0] });
            else result[field] = replacements[field];
            return result;
          };
          await expect(observeFederatedNativeWithdrawalInclusionV1(attempt, withdrawalAuthorize)).rejects.toThrow(/receipt differs/);
          expect(injected).toBe(1); expect(writes()).toEqual(before);
        });

      for (const index of phase === 'approve' ? [0] : [0, 1, 2]) {
        it.each(['address', 'data', 'topic signature', 'topic sender', ...(phase === 'approve' || index < 2 ? ['topic destination'] : ['recipient payload']),
          'blockHash', 'blockNumber', 'transactionHash', 'transactionIndex', 'logIndex', 'removed'])
          (`rejects exact log ${index} %s mismatch`, async field => {
            const { attempt } = await prepareWithdrawal(phase);
            await submitFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize); await sealFederatedNativeWithdrawalV1(attempt, withdrawalAuthorize);
            const before = [...writes()]; let injected = 0;
            fault = (method, _params, result, url) => {
              if (method !== 'eth_getTransactionReceipt' || !url.endsWith('19956')) return result;
              injected++;
              const log = result.logs[index];
              const replacements: Record<string, unknown> = { address: ZERO, blockHash: ETH_PARENT, blockNumber: '0x1',
                transactionHash: hash('77'), transactionIndex: '0x1', logIndex: '0x9', removed: true };
              if (field === 'data') {
                const data = Buffer.from(log.data.slice(2), 'hex'); data[31] ^= 1; log.data = `0x${data.toString('hex')}`;
              } else if (field === 'recipient payload') log.data = ABI.encodeEventLog(ABI.getEvent('PegOut')!,
                [`0x${owner.addressHex}`, 10000000n, OTHER_RECIPIENT]).data;
              else if (field.startsWith('topic')) log.topics[field === 'topic signature' ? 0 : field === 'topic sender' ? 1 : 2] = hash('77');
              else log[field] = replacements[field];
              return result;
            };
            await expect(observeFederatedNativeWithdrawalInclusionV1(attempt, withdrawalAuthorize)).rejects.toThrow(/event differs/);
            expect(injected).toBe(1); expect(writes()).toEqual(before);
          });
      }
    });
  }
});
