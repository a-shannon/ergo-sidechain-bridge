import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { types } from 'node:util';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

const entropy = vi.hoisted(() => ({ randomBytes: vi.fn() }));
vi.mock('node:crypto', async importOriginal => {
  const original = await importOriginal<typeof import('node:crypto')>();
  return { ...original, randomBytes: entropy.randomBytes };
});

import { assertOwnedErgoMiningTransactionPermitControlV1, createOwnedErgoMiningTransactionPermitControlV1 } from './owned-ergo-mining-transaction-permit-control-v1.js';
import { createOwnedErgoMiningSubmissionControlV1 } from './owned-ergo-mining-submission-control-v1.js';
import * as receiptParsers from './owned-ergo-mining-transaction-permit-v1.js';

const ERROR = 'Owned Ergo mining transaction permit failed';
const PAUSE_ERROR = 'Owned Ergo mining submission pause failed';
const nonce = 'aa'.repeat(32);
const transaction = 'bb'.repeat(32);
const secondTransaction = 'cc'.repeat(32);
const prefix = 'http://127.0.0.1:9051/mining/';
const fetchMock = vi.fn<typeof fetch>();
let timeoutSpy: MockInstance<typeof AbortSignal.timeout>;
type Control = ReturnType<typeof createOwnedErgoMiningTransactionPermitControlV1>;
type Arm = Awaited<ReturnType<Control['arm']>>;
type Stage = 'hold' | 'arm' | 'status';

function id(height: number): string { return height.toString(16).padStart(64, '0'); }

function wire(url: string | URL | Request, init?: RequestInit, cap: number | null = null, height = 40): Record<string, unknown> {
  const headers = new Headers(init?.headers);
  const operationId = headers.get('X-Ergo-Owned-Mining-Operation');
  if (String(url).endsWith('ownedSubmissionPauseV1')) return {
    schema: 'e2s.owned-mining-submission-pause.v1', operationId, submissionPaused: true,
    maximumBlockHeight: cap, latestAppliedBlock: null,
  };
  if (String(url).endsWith('ownedTransactionHoldV1')) return {
    schema: 'e2s.owned-mining-transaction-hold.v1', operationId, submissionHeld: true,
    maximumBlockHeight: cap, parent: { headerId: id(height), height },
  };
  const initialParent = { headerId: headers.get('X-Ergo-Owned-Mining-Parent'),
    height: Number(headers.get('X-Ergo-Owned-Mining-Parent-Height')) };
  const common = { operationId, transactionId: headers.get('X-Ergo-Owned-Mining-Transaction'),
    initialParent, confirmations: 10, maximumBlockHeight: cap };
  if (String(url).endsWith('ownedTransactionArmV1')) return {
    schema: 'e2s.owned-mining-transaction-arm.v1', ...common, accepted: true,
  };
  return { schema: 'e2s.owned-mining-transaction-status.v1', ...common, completed: true,
    finalWatermark: { headerId: id(initialParent.height + 11), height: initialParent.height + 11 } };
}

function respond(cap: number | null = null, height = 40): void {
  fetchMock.mockImplementation(async (url, init) => new Response(JSON.stringify(wire(url, init, cap, height))));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function streaming(chunks: Uint8Array[], close = true, cancel = vi.fn()): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) { chunks.forEach(chunk => controller.enqueue(chunk)); if (close) controller.close(); },
    cancel,
  }));
}

async function prepare(stage: Stage, cap: number | null = null): Promise<{ control: Control; invoke: () => Promise<unknown>; arm?: Arm }> {
  respond(cap);
  const control = createOwnedErgoMiningTransactionPermitControlV1(nonce, cap, () => false);
  if (stage === 'hold') return { control, invoke: control.hold };
  await control.hold();
  if (stage === 'arm') return { control, invoke: () => control.arm(transaction) };
  const arm = await control.arm(transaction);
  return { control, arm, invoke: () => control.status(arm) };
}

async function refusal(action: () => Promise<unknown>): Promise<void> {
  const error = await action().catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe(ERROR);
  expect((error as Error).cause).toBeUndefined();
}

async function closed(control: Control): Promise<void> {
  const calls = fetchMock.mock.calls.length;
  const draws = entropy.randomBytes.mock.calls.length;
  await refusal(control.hold);
  await refusal(() => control.arm(transaction));
  expect(fetchMock).toHaveBeenCalledTimes(calls);
  expect(entropy.randomBytes).toHaveBeenCalledTimes(draws);
}

async function statusFailureRetry(factory: typeof createOwnedErgoMiningTransactionPermitControlV1) {
  respond();
  const control = factory(nonce, null, () => false);
  await control.hold();
  const arm = await control.arm(transaction);
  fetchMock.mockRejectedValueOnce(new Error('synthetic status network failure'));
  await refusal(() => control.status(arm));
  const calls = fetchMock.mock.calls.length;
  const draws = entropy.randomBytes.mock.calls.length;
  // No Hold/Arm helper may seal the controller before this exact same-arm retry.
  const retry = await control.status(arm).catch((error: unknown) => error);
  return { control, retry, calls, draws };
}

beforeEach(() => {
  let sequence = 0;
  entropy.randomBytes.mockReset().mockImplementation(() => Buffer.alloc(32, ++sequence));
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('owned mining transaction permit transport with synthetic HTTP', () => {
  it.each(['fresh', 'held', 'running', 'completed'])('checks exact control lifetime in %s without effects', async phase => {
    respond();
    const control = createOwnedErgoMiningTransactionPermitControlV1(nonce, null, () => false);
    if (phase !== 'fresh') await control.hold();
    if (phase === 'running' || phase === 'completed') {
      const arm = await control.arm(transaction);
      if (phase === 'completed') await control.status(arm);
    }
    const counts = [fetchMock.mock.calls.length, entropy.randomBytes.mock.calls.length, timeoutSpy.mock.calls.length];
    assertOwnedErgoMiningTransactionPermitControlV1(control);
    assertOwnedErgoMiningTransactionPermitControlV1(control);
    expect([fetchMock.mock.calls.length, entropy.randomBytes.mock.calls.length, timeoutSpy.mock.calls.length]).toEqual(counts);
    expect(Object.keys(control).sort()).toEqual(['arm', 'hold', 'status']);
    expect(Object.isFrozen(control)).toBe(true);
    // Repeated read guards do not consume the still-available effectful operation.
    if (phase === 'fresh') await expect(control.hold()).resolves.toMatchObject({ submissionHeld: true });
    if (phase === 'held' || phase === 'completed') await expect(control.arm(secondTransaction)).resolves.toMatchObject({ accepted: true });
  });

  it('refuses the exact failed control without further effects', async () => {
    const { control, arm } = await prepare('status');
    await refusal(() => control.status(arm!, 0));
    const counts = [fetchMock.mock.calls.length, entropy.randomBytes.mock.calls.length, timeoutSpy.mock.calls.length];
    expect(() => assertOwnedErgoMiningTransactionPermitControlV1(control)).toThrow(ERROR);
    expect([fetchMock.mock.calls.length, entropy.randomBytes.mock.calls.length, timeoutSpy.mock.calls.length]).toEqual(counts);
  });

  it('refuses immediately when the same nonce Pause is claimed before its response', async () => {
    const owner = createOwnedErgoMiningSubmissionControlV1(null, true);
    assertOwnedErgoMiningTransactionPermitControlV1(owner.transactionPermits!);
    const response = deferred<Response>();
    fetchMock.mockReturnValueOnce(response.promise);
    const pause = owner.pause();
    const counts = [fetchMock.mock.calls.length, entropy.randomBytes.mock.calls.length, timeoutSpy.mock.calls.length];
    expect(() => assertOwnedErgoMiningTransactionPermitControlV1(owner.transactionPermits!)).toThrow(ERROR);
    expect([fetchMock.mock.calls.length, entropy.randomBytes.mock.calls.length, timeoutSpy.mock.calls.length]).toEqual(counts);
    const rejected = expect(pause).rejects.toThrow(PAUSE_ERROR);
    response.reject(new Error('synthetic pause response failure'));
    await rejected;
    expect(() => assertOwnedErgoMiningTransactionPermitControlV1(owner.transactionPermits!)).toThrow(ERROR);
  });

  it('rejects copied foreign and hostile control identities without inspecting them', () => {
    const control = createOwnedErgoMiningTransactionPermitControlV1(nonce, null, () => false);
    let effects = 0;
    const trap = (): never => { effects += 1; throw new Error('synthetic identity trap'); };
    const getter = Object.defineProperty({}, 'hold', { get: trap });
    const revoked = Proxy.revocable(control, {}); revoked.revoke();
    const values = [undefined, null, true, 'control', {}, Object.freeze({ ...control }), Object.create(control), getter,
      new Proxy(control, { get: trap, getPrototypeOf: trap, ownKeys: trap }), revoked.proxy];
    for (const value of values) expect(() => assertOwnedErgoMiningTransactionPermitControlV1(value)).toThrow(ERROR);
    expect(effects).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled(); expect(entropy.randomBytes).not.toHaveBeenCalled();
    expect(timeoutSpy).not.toHaveBeenCalled();
    assertOwnedErgoMiningTransactionPermitControlV1(control);
  });

  it.each([undefined, null, 0, true])('requires the Pause guard to return strict false rather than %s', paused => {
    const control = createOwnedErgoMiningTransactionPermitControlV1(nonce, null, () => paused as boolean);
    expect(() => assertOwnedErgoMiningTransactionPermitControlV1(control)).toThrow(ERROR);
    expect(fetchMock).not.toHaveBeenCalled(); expect(entropy.randomBytes).not.toHaveBeenCalled();
    expect(timeoutSpy).not.toHaveBeenCalled();
  });

  it('sanitizes a lifetime callback exception without closing or mutating the controller', async () => {
    let throws = true;
    const control = createOwnedErgoMiningTransactionPermitControlV1(nonce, null, () => {
      if (throws) throw new Error('synthetic callback secret');
      return false;
    });
    let caught: unknown;
    try { assertOwnedErgoMiningTransactionPermitControlV1(control); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(Error); expect((caught as Error).message).toBe(ERROR);
    expect((caught as Error).cause).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled(); expect(entropy.randomBytes).not.toHaveBeenCalled();
    expect(timeoutSpy).not.toHaveBeenCalled();
    throws = false;
    assertOwnedErgoMiningTransactionPermitControlV1(control);
    respond(); await expect(control.hold()).resolves.toMatchObject({ submissionHeld: true });
  });

  it.each([undefined, 1, 17, 3_000])('uses only the selected status request budget %s', async budget => {
    const { control, arm } = await prepare('status');
    const draws = entropy.randomBytes.mock.calls.length;
    const receipt = budget === undefined ? await control.status(arm!) : await control.status(arm!, budget);
    expect(receipt).toMatchObject({ completed: true, finalWatermark: { headerId: id(51), height: 51 } });
    expect(timeoutSpy.mock.calls).toEqual([[3_000], [3_000], [budget ?? 3_000]]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(entropy.randomBytes).toHaveBeenCalledTimes(draws);
  });

  it.each([
    ['zero', 0], ['negative zero', -0], ['negative', -1], ['NaN', NaN],
    ['infinity', Infinity], ['negative infinity', -Infinity], ['fraction', 1.5],
    ['over ceiling', 3_001], ['boxed number', new Number(1)], ['string', '1'],
    ['null', null], ['boolean', true], ['record', {}], ['bigint', 1n],
  ] as const)('seals invalid status budget %s before any request or immediate retry', async (_name, budget) => {
    const { control, arm } = await prepare('status');
    const calls = fetchMock.mock.calls.length;
    const draws = entropy.randomBytes.mock.calls.length;
    await refusal(() => control.status(arm!, budget as number));
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    expect(entropy.randomBytes).toHaveBeenCalledTimes(draws);
    expect(timeoutSpy.mock.calls).toEqual([[3_000], [3_000]]);
    // A later valid budget cannot revive the exact operation. Do not call closed first.
    await refusal(() => control.status(arm!, 1));
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    expect(entropy.randomBytes).toHaveBeenCalledTimes(draws);
    expect(timeoutSpy.mock.calls).toEqual([[3_000], [3_000]]);
    await closed(control);
  });

  it('seals a failed status request before an immediate same-arm status retry', async () => {
    const observed = await statusFailureRetry(createOwnedErgoMiningTransactionPermitControlV1);
    expect(observed.retry).toBeInstanceOf(Error);
    expect(observed.retry).toMatchObject({ message: ERROR });
    expect((observed.retry as Error).cause).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(observed.calls);
    expect(entropy.randomBytes).toHaveBeenCalledTimes(observed.draws);
    await closed(observed.control);
  });

  it('kills removal of only the status catch failure seal with the immediate retry', async () => {
    const source = readFileSync(new URL('./owned-ergo-mining-transaction-permit-control-v1.ts', import.meta.url), 'utf8')
      .replace(/\r\n/g, '\n');
    const before = "    } catch {\n      phase = 'failed';\n      throw new Error(ERROR_MESSAGE);\n    } finally { statusPending = false; }";
    expect(source.split(before)).toHaveLength(2);
    const loadFactory = (candidate: string) => {
    const compiled = ts.transpileModule(candidate, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports: { createOwnedErgoMiningTransactionPermitControlV1?: typeof createOwnedErgoMiningTransactionPermitControlV1 } = {};
    runInNewContext(compiled, {
      exports, Buffer, Error, Object, Number, Set, TextDecoder, AbortSignal, fetch: fetchMock,
      require: (name: string) => {
        if (name === 'node:crypto') return { randomBytes: entropy.randomBytes };
        if (name === 'node:util') return { types };
        // Only trusted, source-constructed parser arguments cross this VM boundary.
        // Recreate their plain records in the parser's realm; the actual parser
        // still performs every wire validation. This is not a hostile-input test.
        if (name === './owned-ergo-mining-transaction-permit-v1.js') return {
          parseOwnedErgoMiningTransactionHoldReceiptV1: (input: unknown) =>
            receiptParsers.parseOwnedErgoMiningTransactionHoldReceiptV1(JSON.parse(JSON.stringify(input))),
          parseOwnedErgoMiningTransactionArmReceiptV1: (input: unknown) =>
            receiptParsers.parseOwnedErgoMiningTransactionArmReceiptV1(JSON.parse(JSON.stringify(input))),
          parseOwnedErgoMiningTransactionStatusReceiptV1: (input: unknown) =>
            receiptParsers.parseOwnedErgoMiningTransactionStatusReceiptV1(JSON.parse(JSON.stringify(input))),
        };
        throw new Error('Unexpected permit transport dependency');
      },
    }, { timeout: 1000 });
    expect(exports.createOwnedErgoMiningTransactionPermitControlV1).toBeTypeOf('function');
    return exports.createOwnedErgoMiningTransactionPermitControlV1!;
    };
    const baseline = await statusFailureRetry(loadFactory(source));
    expect(baseline.retry).toBeInstanceOf(Error);
    expect(baseline.retry).toMatchObject({ message: ERROR });
    expect(fetchMock).toHaveBeenCalledTimes(baseline.calls);
    expect(entropy.randomBytes).toHaveBeenCalledTimes(baseline.draws);
    const observed = await statusFailureRetry(loadFactory(source.replace(before, before.replace("      phase = 'failed';\n", ''))));
    expect(observed.retry).toMatchObject({ completed: true, finalWatermark: { headerId: id(51), height: 51 } });
    expect(fetchMock).toHaveBeenCalledTimes(observed.calls + 1);
    expect(entropy.randomBytes).toHaveBeenCalledTimes(observed.draws);
  });

  it.each([null, 100])('joins Hold Arm Pending Completed and the next Arm with cap %s', async cap => {
    respond(cap);
    const control = createOwnedErgoMiningTransactionPermitControlV1(nonce, cap, () => false);
    expect(Object.isFrozen(control)).toBe(true);
    expect(Object.keys(control).sort()).toEqual(['arm', 'hold', 'status']);
    const held = await control.hold();
    const arm = await control.arm(transaction);
    fetchMock.mockImplementationOnce(async (url, init) => new Response(JSON.stringify({
      ...wire(url, init, cap), completed: false, finalWatermark: null,
    })));
    expect(await control.status(arm)).toMatchObject({ operationId: arm.operationId, completed: false, finalWatermark: null });
    const completed = await control.status(arm);
    expect(completed).toMatchObject({ operationId: arm.operationId, transactionId: transaction,
      initialParent: held.parent, completed: true, finalWatermark: { headerId: id(51), height: 51 } });
    const next = await control.arm(secondTransaction);
    expect(next.initialParent).toEqual(completed.finalWatermark);
    expect(next.operationId).not.toBe(arm.operationId);
    expect(next.transactionId).toBe(secondTransaction);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(entropy.randomBytes.mock.calls).toEqual([[32], [32], [32]]);
    expect(timeoutSpy.mock.calls).toEqual(Array.from({ length: 5 }, () => [3_000]));
    const endpoints = ['ownedTransactionHoldV1', 'ownedTransactionArmV1', 'ownedTransactionStatusV1',
      'ownedTransactionStatusV1', 'ownedTransactionArmV1'];
    fetchMock.mock.calls.forEach(([url, init], index) => {
      expect(url).toBe(prefix + endpoints[index]);
      expect(init?.method).toBe('POST'); expect(init?.redirect).toBe('error'); expect(init?.body).toBeUndefined();
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const headers = new Headers(init?.headers);
      expect(headers.get('api_key')).toBe('hello');
      expect(headers.get('Accept')).toBe('application/json');
      expect(headers.get('Accept-Encoding')).toBe('identity');
      expect(headers.get('X-Ergo-Owned-Mining-Nonce')).toBe(nonce);
      if (index === 0) {
        expect(headers.get('X-Ergo-Owned-Mining-Transaction')).toBeNull();
        expect(headers.get('X-Ergo-Owned-Mining-Parent')).toBeNull();
      } else {
        expect(headers.get('X-Ergo-Owned-Mining-Transaction')).toBe(index === 4 ? secondTransaction : transaction);
        expect(headers.get('X-Ergo-Owned-Mining-Parent')).toBe(id(index === 4 ? 51 : 40));
        expect(headers.get('X-Ergo-Owned-Mining-Parent-Height')).toBe(index === 4 ? '51' : '40');
      }
      if (index === 2 || index === 3) expect(headers.get('X-Ergo-Owned-Mining-Operation')).toBe(arm.operationId);
    });
    expect(Object.isFrozen(arm)).toBe(true); expect(Object.isFrozen(arm.initialParent)).toBe(true);
    expect(Object.isFrozen(completed)).toBe(true); expect(Object.isFrozen(completed.finalWatermark)).toBe(true);
  });

  it('uses exact stored receipt identity and rejects copied hostile or stale receipts without HTTP', async () => {
    const { control, arm } = await prepare('status');
    let effects = 0;
    const trap = (): never => { effects += 1; throw new Error('synthetic secret'); };
    const before = fetchMock.mock.calls.length;
    for (const receipt of [{ ...arm }, new Proxy(arm!, { get: trap, getPrototypeOf: trap, ownKeys: trap }), null]) {
      await refusal(() => control.status(receipt as Arm));
      expect(fetchMock).toHaveBeenCalledTimes(before);
    }
    expect(effects).toBe(0);
    await expect(control.status(arm!)).resolves.toMatchObject({ completed: true });
    const next = await control.arm(secondTransaction);
    const calls = fetchMock.mock.calls.length;
    await refusal(() => control.status(arm!));
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    await expect(control.status(next)).resolves.toMatchObject({ completed: true, transactionId: secondTransaction });
  });

  it('refuses Arm before Hold without entropy or HTTP and permanently closes the controller', async () => {
    const control = createOwnedErgoMiningTransactionPermitControlV1(nonce, null, () => false);
    await refusal(() => control.arm(transaction));
    await closed(control);
    expect(fetchMock).not.toHaveBeenCalled(); expect(entropy.randomBytes).not.toHaveBeenCalled();
  });

  it.each(['repeat Hold', 'Arm before completion'])('refuses %s after an acknowledged effect without another request', async fault => {
    const fixture = await prepare(fault === 'repeat Hold' ? 'arm' : 'status');
    const calls = fetchMock.mock.calls.length;
    const draws = entropy.randomBytes.mock.calls.length;
    await refusal(fault === 'repeat Hold' ? fixture.control.hold : () => fixture.control.arm(secondTransaction));
    await closed(fixture.control);
    expect(fetchMock).toHaveBeenCalledTimes(calls); expect(entropy.randomBytes).toHaveBeenCalledTimes(draws);
  });

  it.each(['hold', 'arm'] as const)('claims %s before fetch and refuses concurrent effectful replay', async stage => {
    const fixture = await prepare(stage);
    const response = deferred<Response>();
    fetchMock.mockImplementationOnce(() => response.promise);
    const pending = fixture.invoke();
    const observed = pending.catch((error: unknown) => error);
    const count = fetchMock.mock.calls.length;
    await refusal(fixture.invoke);
    expect(fetchMock).toHaveBeenCalledTimes(count);
    const [url, init] = fetchMock.mock.calls[count - 1];
    response.resolve(new Response(JSON.stringify(wire(url, init))));
    expect(await observed).toMatchObject({ message: ERROR });
    await closed(fixture.control);
  });

  it('refuses concurrent status without consuming or replacing the one pending status', async () => {
    const { control, arm } = await prepare('status');
    const response = deferred<Response>(); fetchMock.mockImplementationOnce(() => response.promise);
    const pending = control.status(arm!);
    await refusal(() => control.status(arm!)); expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, init] = fetchMock.mock.calls[2]; response.resolve(new Response(JSON.stringify(wire(url, init))));
    await expect(pending).resolves.toMatchObject({ completed: true });
    await expect(control.status(arm!)).resolves.toMatchObject({ completed: true });
    expect(entropy.randomBytes).toHaveBeenCalledTimes(2);
  });

  it('refuses the next Arm while a repeat completion status is in flight', async () => {
    const { control, arm } = await prepare('status'); await control.status(arm!);
    const response = deferred<Response>(); fetchMock.mockImplementationOnce(() => response.promise);
    const observed = control.status(arm!).catch((error: unknown) => error);
    await refusal(() => control.arm(secondTransaction)); expect(fetchMock).toHaveBeenCalledTimes(4);
    const [url, init] = fetchMock.mock.calls[3]; response.resolve(new Response(JSON.stringify(wire(url, init))));
    expect(await observed).toMatchObject({ message: ERROR }); await closed(control);
  });

  it.each(['pending reversal', 'conflicting completion'])('refuses %s after a completed status', async fault => {
    const { control, arm } = await prepare('status'); await control.status(arm!);
    fetchMock.mockImplementationOnce(async (url, init) => new Response(JSON.stringify({ ...wire(url, init),
      ...(fault === 'pending reversal' ? { completed: false, finalWatermark: null }
        : { finalWatermark: { headerId: 'dd'.repeat(32), height: 51 } }),
    })));
    await refusal(() => control.status(arm!)); await closed(control);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('bounds Hold plus Arm identities at 64 while repeated status consumes no identity', async () => {
    respond(); const control = createOwnedErgoMiningTransactionPermitControlV1(nonce, null, () => false);
    await control.hold();
    for (let index = 0; index < 63; index += 1) {
      const arm = await control.arm(transaction);
      await control.status(arm);
      if (index === 0) for (let read = 0; read < 65; read += 1) await control.status(arm);
    }
    const calls = fetchMock.mock.calls.length;
    expect(entropy.randomBytes).toHaveBeenCalledTimes(64);
    await refusal(() => control.arm(secondTransaction)); await closed(control);
    expect(fetchMock).toHaveBeenCalledTimes(calls); expect(entropy.randomBytes).toHaveBeenCalledTimes(64);
  });

  it.each(['nonce collision', 'duplicate operation', 'short entropy', 'entropy failure'])('refuses %s before another HTTP effect', async fault => {
    respond(); const control = createOwnedErgoMiningTransactionPermitControlV1(nonce, null, () => false);
    if (fault === 'duplicate operation') await control.hold();
    const calls = fetchMock.mock.calls.length;
    if (fault === 'entropy failure') entropy.randomBytes.mockImplementationOnce(() => { throw new Error('synthetic entropy secret'); });
    else entropy.randomBytes.mockReturnValueOnce(fault === 'nonce collision' ? Buffer.from(nonce, 'hex')
      : Buffer.alloc(fault === 'short entropy' ? 31 : 32, 1));
    await refusal(fault === 'duplicate operation' ? () => control.arm(transaction) : control.hold);
    await closed(control); expect(fetchMock).toHaveBeenCalledTimes(calls);
  });

  it.each(['', nonce + '\n', 'AA'.repeat(32), null, 1])('refuses malformed constructor nonce %s before effects', value => {
    expect(() => createOwnedErgoMiningTransactionPermitControlV1(value as string, null, () => false)).toThrow(ERROR);
    expect(fetchMock).not.toHaveBeenCalled(); expect(entropy.randomBytes).not.toHaveBeenCalled();
  });
  it.each([-0, -1, 1.5, NaN, Infinity, 2_147_483_648, '100'])('refuses malformed cap %s before effects', cap => {
    expect(() => createOwnedErgoMiningTransactionPermitControlV1(nonce, cap as number, () => false)).toThrow(ERROR);
    expect(fetchMock).not.toHaveBeenCalled(); expect(entropy.randomBytes).not.toHaveBeenCalled();
  });
  it.each(['', transaction + '\n', 'BB'.repeat(32), null])('refuses malformed Arm transaction %s before operation/HTTP', async value => {
    const fixture = await prepare('arm'); const draws = entropy.randomBytes.mock.calls.length;
    await refusal(() => fixture.control.arm(value as string)); await closed(fixture.control);
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(entropy.randomBytes).toHaveBeenCalledTimes(draws);
  });
  it.each([50, 2_147_483_647])('refuses a held parent without inclusion plus ten successors (cap %s)', async cap => {
    const height = cap === 50 ? 40 : 2_147_483_640;
    respond(cap, height); const control = createOwnedErgoMiningTransactionPermitControlV1(nonce, cap, () => false);
    await control.hold(); await refusal(() => control.arm(transaction)); await closed(control);
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(entropy.randomBytes).toHaveBeenCalledTimes(1);
  });
});

describe('shared permanent Pause invalidation', () => {
  it('keeps omitted opt-in absent and binds enabled transports to the same nonce', async () => {
    const legacy = createOwnedErgoMiningSubmissionControlV1();
    expect(Object.hasOwn(legacy, 'transactionPermits')).toBe(false);
    respond(100); const control = createOwnedErgoMiningSubmissionControlV1(100, true);
    await control.transactionPermits!.hold(); await control.pause();
    const firstNonce = new Headers(fetchMock.mock.calls[0][1]?.headers).get('X-Ergo-Owned-Mining-Nonce')!;
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('X-Ergo-Owned-Mining-Nonce')).toBe(firstNonce);
    expect(control.nonceSha256Hex).toBe(createHash('sha256').update(firstNonce, 'utf8').digest('hex'));
    expect(JSON.stringify(control)).not.toContain(firstNonce);
    await closed(control.transactionPermits!); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(['hold', 'arm', 'status'] as const)('invalidates in-flight %s as soon as Pause is claimed, even when Pause fails', async stage => {
    respond(); const owner = createOwnedErgoMiningSubmissionControlV1(null, true);
    const control = owner.transactionPermits!;
    let arm: Arm | undefined;
    if (stage !== 'hold') await control.hold();
    if (stage === 'status') arm = await control.arm(transaction);
    const response = deferred<Response>(); fetchMock.mockImplementationOnce(() => response.promise);
    const observed = (stage === 'hold' ? control.hold() : stage === 'arm' ? control.arm(transaction) : control.status(arm!))
      .catch((error: unknown) => error);
    const pendingIndex = fetchMock.mock.calls.length - 1;
    fetchMock.mockRejectedValueOnce(new Error('synthetic pause failure'));
    await expect(owner.pause()).rejects.toThrow(PAUSE_ERROR);
    const [url, init] = fetchMock.mock.calls[pendingIndex]; response.resolve(new Response(JSON.stringify(wire(url, init))));
    expect(await observed).toMatchObject({ message: ERROR });
    const calls = fetchMock.mock.calls.length; await closed(control); expect(fetchMock).toHaveBeenCalledTimes(calls);
  });
  it('invalidates a permit during a pending streamed body read', async () => {
    respond(); const owner = createOwnedErgoMiningSubmissionControlV1(null, true);
    const reading = deferred<void>(); let stream!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) { stream = controller; }, pull() { reading.resolve(); },
    }, { highWaterMark: 0 }));
    fetchMock.mockResolvedValueOnce(response);
    const observed = owner.transactionPermits!.hold().catch((error: unknown) => error);
    await reading.promise;
    await owner.pause();
    stream.enqueue(Buffer.from(JSON.stringify(wire(fetchMock.mock.calls[0][0], fetchMock.mock.calls[0][1]))));
    expect(await observed).toMatchObject({ message: ERROR });
    expect(response.body!.locked).toBe(false); await closed(owner.transactionPermits!);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('bounded response and generic failure closure', () => {
  it.each(['hold', 'arm', 'status'] as const)('seals %s on a failed network request without retry or disclosure', async stage => {
    const fixture = await prepare(stage);
    fetchMock.mockRejectedValueOnce(new Error(`synthetic secret ${nonce}`));
    const before = fetchMock.mock.calls.length; await refusal(fixture.invoke); await closed(fixture.control);
    expect(fetchMock).toHaveBeenCalledTimes(before + 1);
  });
  it.each([400, 500, 503])('refuses HTTP %s and cancels its unread body', async status => {
    const fixture = await prepare('hold'); const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { status }); fetchMock.mockResolvedValueOnce(response);
    await refusal(fixture.invoke); await closed(fixture.control);
    expect(cancel).toHaveBeenCalledTimes(1); expect(response.body!.locked).toBe(false);
  });
  it.each(['gzip', 'br', 'identity, gzip', ''])('refuses compressed/invalid encoding %s before reading', async encoding => {
    const fixture = await prepare('hold'); const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { headers: { 'content-encoding': encoding } });
    fetchMock.mockResolvedValueOnce(response); await refusal(fixture.invoke); await closed(fixture.control);
    expect(cancel).toHaveBeenCalledTimes(1); expect(response.body!.locked).toBe(false);
  });
  it.each(['identity', ' Identity '])('accepts explicit identity encoding %s', async encoding => {
    const fixture = await prepare('hold');
    fetchMock.mockImplementationOnce(async (url, init) => new Response(JSON.stringify(wire(url, init)), { headers: { 'content-encoding': encoding } }));
    await expect(fixture.invoke()).resolves.toMatchObject({ submissionHeld: true });
  });
  it('refuses redirects without following them', async () => {
    const fixture = await prepare('hold'); const cancel = vi.fn(); const response = new Response(new ReadableStream({ cancel }));
    Object.defineProperty(response, 'redirected', { value: true }); fetchMock.mockResolvedValueOnce(response);
    await refusal(fixture.invoke); await closed(fixture.control);
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('refuses a null body', async () => {
    const fixture = await prepare('hold'); fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await refusal(fixture.invoke); await closed(fixture.control);
  });
  it('refuses an empty successful body and releases the acquired reader', async () => {
    const fixture = await prepare('hold'); const response = new Response(''); fetchMock.mockResolvedValueOnce(response);
    await refusal(fixture.invoke); await closed(fixture.control);
    expect(response.body!.locked).toBe(false); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('accepts exactly 16 KiB split between chunks and releases the lock', async () => {
    const fixture = await prepare('hold'); let response!: Response;
    fetchMock.mockImplementationOnce(async (url, init) => {
      const bytes = Buffer.from(JSON.stringify(wire(url, init)).padEnd(16 * 1024, ' '));
      response = streaming([bytes.subarray(0, 17), bytes.subarray(17)]); return response;
    });
    await expect(fixture.invoke()).resolves.toMatchObject({ submissionHeld: true }); expect(response.body!.locked).toBe(false);
  });
  it.each(['single oversized', 'split oversized', 'empty chunk', 'nonbyte chunk'])('refuses %s and cancels/releases', async fault => {
    const fixture = await prepare('hold'); const cancel = vi.fn();
    const chunks = fault === 'single oversized' ? [Buffer.alloc(16 * 1024 + 1)]
      : fault === 'split oversized' ? [Buffer.alloc(16 * 1024), Buffer.alloc(1)]
        : fault === 'empty chunk' ? [Buffer.alloc(0)] : ['bad chunk' as unknown as Uint8Array];
    const response = streaming(chunks, false, cancel); fetchMock.mockResolvedValueOnce(response);
    await refusal(fixture.invoke); await closed(fixture.control);
    expect(cancel).toHaveBeenCalledTimes(1); expect(response.body!.locked).toBe(false);
  });
  it.each([Buffer.from([0xc3, 0x28]), Buffer.from([0xc3]), Buffer.from([0xff])])('refuses malformed UTF8 %s', async bytes => {
    const fixture = await prepare('hold'); const response = streaming([bytes]); fetchMock.mockResolvedValueOnce(response);
    await refusal(fixture.invoke); await closed(fixture.control); expect(response.body!.locked).toBe(false);
  });
  it('refuses a BOM without silently stripping it', async () => {
    const fixture = await prepare('hold');
    fetchMock.mockImplementationOnce(async (url, init) => streaming([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(wire(url, init)))]));
    await refusal(fixture.invoke); await closed(fixture.control);
  });
  it('hides reader errors and releases the lock', async () => {
    const fixture = await prepare('hold'); const response = new Response(new ReadableStream({
      start(controller) { controller.error(new Error(`synthetic secret ${nonce}`)); },
    }));
    fetchMock.mockResolvedValueOnce(response); await refusal(fixture.invoke); await closed(fixture.control);
    expect(response.body!.locked).toBe(false);
  });
  it.each(['reject', 'pending'])('does not await %s cancellation after bounded refusal', async outcome => {
    const fixture = await prepare('hold');
    const cancel = vi.fn(() => outcome === 'reject' ? Promise.reject(new Error('synthetic cancellation secret')) : new Promise<void>(() => {}));
    const response = streaming([Buffer.alloc(16 * 1024 + 1)], false, cancel); fetchMock.mockResolvedValueOnce(response);
    await refusal(fixture.invoke); await closed(fixture.control);
    expect(cancel).toHaveBeenCalledTimes(1); expect(response.body!.locked).toBe(false);
  });
  it.each(['fetch', 'body'])('refuses the existing deadline during %s without extending it', async phase => {
    const fixture = await prepare('hold'); const abort = new AbortController(); timeoutSpy.mockReturnValue(abort.signal);
    const entered = deferred<void>(); let response: Response | undefined;
    if (phase === 'fetch') fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('synthetic fetch abort')), { once: true }); entered.resolve();
    }));
    else {
      response = new Response(new ReadableStream<Uint8Array>({
        start(controller) { abort.signal.addEventListener('abort', () => controller.error(new Error('synthetic body abort')), { once: true }); },
        pull() { entered.resolve(); },
      }, { highWaterMark: 0 })); fetchMock.mockResolvedValueOnce(response);
    }
    const observed = fixture.invoke().catch((error: unknown) => error); await entered.promise; abort.abort();
    expect(await observed).toMatchObject({ message: ERROR }); await closed(fixture.control);
    expect(timeoutSpy).toHaveBeenCalledExactlyOnceWith(3_000); expect(fetchMock).toHaveBeenCalledTimes(1);
    if (response) expect(response.body!.locked).toBe(false);
  });

  it.each(['headers', 'body completion'])('refuses an aborted signal at %s even without a fetch/read exception', async phase => {
    const fixture = await prepare('hold'); const abort = new AbortController(); timeoutSpy.mockReturnValue(abort.signal);
    const cancel = vi.fn(); let response!: Response;
    fetchMock.mockImplementationOnce(async (url, init) => {
      if (phase === 'headers') {
        response = new Response(new ReadableStream({ cancel })); abort.abort();
      } else {
        let sent = false;
        response = new Response(new ReadableStream<Uint8Array>({
          pull(controller) {
            if (!sent) { sent = true; controller.enqueue(Buffer.from(JSON.stringify(wire(url, init)))); }
            else { abort.abort(); controller.close(); }
          }, cancel,
        }, { highWaterMark: 0 }));
      }
      return response;
    });
    await refusal(fixture.invoke); await closed(fixture.control);
    expect(response.body!.locked).toBe(false); expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(timeoutSpy).toHaveBeenCalledExactlyOnceWith(3_000);
    if (phase === 'headers') expect(cancel).toHaveBeenCalledTimes(1);
  });

  for (const stage of ['hold', 'arm', 'status'] as const) {
    it.each(['operation', 'cap', 'extra', 'duplicate'])(`${stage} refuses independently faulty wire %s`, async fault => {
      const fixture = await prepare(stage);
      fetchMock.mockImplementationOnce(async (url, init) => {
        const value = wire(url, init);
        if (fault === 'operation') value.operationId = 'ff'.repeat(32);
        if (fault === 'cap') value.maximumBlockHeight = 100;
        if (fault === 'extra') value.extra = 'synthetic secret';
        const text = JSON.stringify(value);
        return new Response(fault === 'duplicate' ? text.replace(/}$/, ',"maximumBlockHeight":null}') : text);
      });
      const before = fetchMock.mock.calls.length; await refusal(fixture.invoke); await closed(fixture.control);
      expect(fetchMock).toHaveBeenCalledTimes(before + 1);
    });
  }
  for (const stage of ['arm', 'status'] as const) {
    it.each(['transaction', 'parent id', 'parent height', 'confirmations'])(`${stage} refuses incorrect echoed %s`, async fault => {
      const fixture = await prepare(stage);
      fetchMock.mockImplementationOnce(async (url, init) => {
        const value = wire(url, init);
        if (fault === 'transaction') value.transactionId = secondTransaction;
        if (fault === 'parent id') value.initialParent = { headerId: id(41), height: 40 };
        if (fault === 'parent height') value.initialParent = { headerId: id(40), height: 41 };
        if (fault === 'confirmations') value.confirmations = 9;
        return new Response(JSON.stringify(value));
      });
      const before = fetchMock.mock.calls.length; await refusal(fixture.invoke); await closed(fixture.control);
      expect(fetchMock).toHaveBeenCalledTimes(before + 1);
    });
  }
});
