import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

const entropy = vi.hoisted(() => ({ randomBytes: vi.fn() }));
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomBytes: entropy.randomBytes };
});

import { createOwnedErgoMiningSubmissionControlV1 } from './owned-ergo-mining-submission-control-v1.js';

const GENERIC = 'Owned Ergo mining submission pause failed';
const fetchMock = vi.fn<typeof fetch>();
let timeoutSpy: MockInstance<typeof AbortSignal.timeout>;

function wire(init: RequestInit | undefined, cap: number | null = null): Record<string, unknown> {
  return {
    schema: 'e2s.owned-mining-submission-pause.v1',
    operationId: new Headers(init?.headers).get('X-Ergo-Owned-Mining-Operation'),
    submissionPaused: true,
    maximumBlockHeight: cap,
    latestAppliedBlock: null,
  };
}

function respond(cap: number | null = null): void {
  fetchMock.mockImplementation(async (_url, init) => new Response(JSON.stringify(wire(init, cap))));
}

async function rejectedOnce(pause: () => Promise<unknown>): Promise<void> {
  const error = await pause().catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).name).toBe('Error');
  expect((error as Error).message).toBe(GENERIC);
  expect((error as Error).cause).toBeUndefined();
  const calls = fetchMock.mock.calls.length;
  const draws = entropy.randomBytes.mock.calls.length;
  await expect(pause()).rejects.toThrow(GENERIC);
  expect(fetchMock).toHaveBeenCalledTimes(calls);
  expect(entropy.randomBytes).toHaveBeenCalledTimes(draws);
}

function streaming(chunks: Uint8Array[], close = true, cancel = vi.fn()): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      if (close) controller.close();
    },
    cancel,
  }));
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

describe('owned mining submission one-use transport (synthetic HTTP only)', () => {
  it.each([null, 0, 1, 2_147_483_647])('binds the exact ceiling %s and fixed request', async (cap) => {
    respond(cap);
    const control = cap === null ? createOwnedErgoMiningSubmissionControlV1()
      : createOwnedErgoMiningSubmissionControlV1(cap);
    expect(Object.isFrozen(control)).toBe(true);
    expect(Object.keys(control).sort()).toEqual(['maximumBlockHeight', 'nonceSha256Hex', 'pause']);
    expect(control.maximumBlockHeight).toBe(cap);
    const receipt = await control.pause();
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(receipt.maximumBlockHeight).toBe(cap);
    expect(receipt.latestAppliedBlock).toBeNull();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:9051/mining/ownedSubmissionPauseV1');
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('error');
    expect(init?.body).toBeUndefined();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(timeoutSpy).toHaveBeenCalledExactlyOnceWith(3_000);
    const headers = new Headers(init?.headers);
    expect(headers.get('api_key')).toBe('hello');
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('Accept-Encoding')).toBe('identity');
    const nonce = headers.get('X-Ergo-Owned-Mining-Nonce')!;
    const operation = headers.get('X-Ergo-Owned-Mining-Operation')!;
    expect(nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(operation).toMatch(/^[0-9a-f]{64}$/);
    expect(operation).not.toBe(nonce);
    expect(receipt.operationId).toBe(operation);
    expect(control.nonceSha256Hex).toBe(createHash('sha256').update(nonce, 'utf8').digest('hex'));
    expect(JSON.stringify(control)).not.toContain(nonce);
    expect(entropy.randomBytes.mock.calls).toEqual([[32], [32]]);
    await expect(control.pause()).rejects.toThrow(GENERIC);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([-0, -1, 0.5, NaN, Infinity, -Infinity, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1,
    '1', true, 1n, new Number(1), undefined])('rejects invalid ceiling %s before entropy/HTTP', (cap) => {
    // Explicit undefined selects the documented default; all other values must fail.
    if (cap === undefined) {
      expect(createOwnedErgoMiningSubmissionControlV1(undefined).maximumBlockHeight).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    } else {
      expect(() => createOwnedErgoMiningSubmissionControlV1(cap as number)).toThrow(GENERIC);
      expect(entropy.randomBytes).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it('does not coerce hostile ceiling getters or proxies', () => {
    const effects = vi.fn(() => { throw new Error('private coercion'); });
    const getter = { get valueOf() { return effects(); } };
    const proxy = new Proxy({}, { get: effects, getPrototypeOf: effects });
    for (const cap of [getter, proxy]) {
      expect(() => createOwnedErgoMiningSubmissionControlV1(cap as number)).toThrow(GENERIC);
    }
    expect(effects).not.toHaveBeenCalled();
    expect(entropy.randomBytes).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates independent fresh nonce and operation draws per factory', async () => {
    respond();
    const first = createOwnedErgoMiningSubmissionControlV1();
    const second = createOwnedErgoMiningSubmissionControlV1();
    expect(first.nonceSha256Hex).not.toBe(second.nonceSha256Hex);
    const receipts = await Promise.all([first.pause(), second.pause()]);
    expect(receipts[0].operationId).not.toBe(receipts[1].operationId);
    expect(entropy.randomBytes.mock.calls).toEqual([[32], [32], [32], [32]]);
  });

  it('claims before pending HTTP and rejects concurrent/repeated invocation', async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    const control = createOwnedErgoMiningSubmissionControlV1();
    const pending = control.pause();
    await expect(control.pause()).rejects.toThrow(GENERIC);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(entropy.randomBytes).toHaveBeenCalledTimes(2);
    resolve(new Response(JSON.stringify(wire(fetchMock.mock.calls[0][1]))));
    await expect(pending).resolves.toMatchObject({ submissionPaused: true });
    await expect(control.pause()).rejects.toThrow(GENERIC);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a deadline abort during pending fetch and permanently consumes the claim', async () => {
    const controller = new AbortController();
    timeoutSpy.mockImplementation(() => controller.signal);
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('private fetch abort')), { once: true });
    }));
    const control = createOwnedErgoMiningSubmissionControlV1();
    const pending = control.pause();
    controller.abort();
    await expect(pending).rejects.toThrow(GENERIC);
    await expect(control.pause()).rejects.toThrow(GENERIC);
    expect(timeoutSpy).toHaveBeenCalledExactlyOnceWith(3_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a deadline abort during body consumption and releases its reader lock', async () => {
    const controller = new AbortController();
    timeoutSpy.mockImplementation(() => controller.signal);
    let reachedRead!: () => void;
    const reading = new Promise<void>(resolve => { reachedRead = resolve; });
    const response = new Response(new ReadableStream<Uint8Array>({
      start(stream) {
        controller.signal.addEventListener('abort', () => stream.error(new Error('private body abort')), { once: true });
      },
      pull() { reachedRead(); },
    }, { highWaterMark: 0 }));
    fetchMock.mockResolvedValue(response);
    const control = createOwnedErgoMiningSubmissionControlV1();
    const pending = control.pause();
    await reading;
    controller.abort();
    await expect(pending).rejects.toThrow(GENERIC);
    await expect(control.pause()).rejects.toThrow(GENERIC);
    expect(response.body!.locked).toBe(false);
    expect(timeoutSpy).toHaveBeenCalledExactlyOnceWith(3_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('hides network echoes and permanently consumes a failed claim', async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      throw new Error(`private body ${new Headers(init?.headers).get('X-Ergo-Owned-Mining-Nonce')}`);
    });
    await rejectedOnce(createOwnedErgoMiningSubmissionControlV1().pause);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('hides constructor entropy errors before HTTP', () => {
    entropy.randomBytes.mockImplementationOnce(() => { throw new Error('private random failure'); });
    expect(() => createOwnedErgoMiningSubmissionControlV1()).toThrow(GENERIC);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('consumes the claim even if operation entropy fails before HTTP', async () => {
    const control = createOwnedErgoMiningSubmissionControlV1();
    entropy.randomBytes.mockImplementationOnce(() => { throw new Error('private operation failure'); });
    await rejectedOnce(control.pause);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([400, 500, 503])('refuses status %s and cancels the unread stream', async (status) => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { status });
    fetchMock.mockResolvedValue(response);
    await rejectedOnce(createOwnedErgoMiningSubmissionControlV1().pause);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(response.body?.locked).toBe(false);
  });

  it('refuses a null response body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await rejectedOnce(createOwnedErgoMiningSubmissionControlV1().pause);
  });

  it.each(['gzip', 'br', 'identity, gzip', ''])('refuses content encoding %s before reading', async (encoding) => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { headers: { 'content-encoding': encoding } });
    fetchMock.mockResolvedValue(response);
    await rejectedOnce(createOwnedErgoMiningSubmissionControlV1().pause);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(response.body?.locked).toBe(false);
  });

  it.each(['identity', ' Identity '])('accepts encoding %s', async (encoding) => {
    fetchMock.mockImplementation(async (_url, init) => new Response(JSON.stringify(wire(init)), {
      headers: { 'content-encoding': encoding },
    }));
    await expect(createOwnedErgoMiningSubmissionControlV1().pause()).resolves.toMatchObject({ submissionPaused: true });
  });

  it('refuses a redirected response', async () => {
    const response = new Response(new ReadableStream());
    Object.defineProperty(response, 'redirected', { value: true });
    fetchMock.mockResolvedValue(response);
    await rejectedOnce(createOwnedErgoMiningSubmissionControlV1().pause);
    expect(response.body?.locked).toBe(false);
  });

  it('accepts exactly 16KiB split across response chunks', async () => {
    let response!: Response;
    fetchMock.mockImplementation(async (_url, init) => {
      const bytes = Buffer.from(JSON.stringify(wire(init)).padEnd(16 * 1024, ' '));
      response = streaming([bytes.subarray(0, 17), bytes.subarray(17)]);
      return response;
    });
    await expect(createOwnedErgoMiningSubmissionControlV1().pause()).resolves.toMatchObject({ submissionPaused: true });
    expect(response.body?.locked).toBe(false);
  });

  it.each([true, false])('refuses over-limit bytes (single chunk=%s) and cancels/releases', async (single) => {
    const cancel = vi.fn();
    const chunks = single ? [Buffer.alloc(16 * 1024 + 1)] : [Buffer.alloc(16 * 1024), Buffer.alloc(1)];
    const response = streaming(chunks, false, cancel);
    fetchMock.mockResolvedValue(response);
    await rejectedOnce(createOwnedErgoMiningSubmissionControlV1().pause);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(response.body?.locked).toBe(false);
  });

  it.each([Buffer.alloc(0), 'not bytes' as unknown as Uint8Array])('refuses unusable streamed chunks', async (chunk) => {
    const cancel = vi.fn();
    const response = streaming([chunk], false, cancel);
    fetchMock.mockResolvedValue(response);
    await rejectedOnce(createOwnedErgoMiningSubmissionControlV1().pause);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(response.body?.locked).toBe(false);
  });

  it.each([Buffer.from([0xc3, 0x28]), Buffer.from([0xc3]), Buffer.from([0xff])])('refuses malformed UTF8 %s', async (bytes) => {
    const response = streaming([bytes]);
    fetchMock.mockResolvedValue(response);
    await rejectedOnce(createOwnedErgoMiningSubmissionControlV1().pause);
    expect(response.body?.locked).toBe(false);
  });

  it('refuses a BOM instead of silently stripping it', async () => {
    fetchMock.mockImplementation(async (_url, init) => streaming([
      Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(wire(init))),
    ]));
    await rejectedOnce(createOwnedErgoMiningSubmissionControlV1().pause);
  });

  it('hides read failures and releases the reader', async () => {
    const response = new Response(new ReadableStream({ start(controller) { controller.error(new Error('private stream failure')); } }));
    fetchMock.mockResolvedValue(response);
    await rejectedOnce(createOwnedErgoMiningSubmissionControlV1().pause);
    expect(response.body?.locked).toBe(false);
  });

  it.each(['reject', 'pending'])('does not await a %s cancellation outcome', async (outcome) => {
    const cancel = vi.fn(() => outcome === 'reject' ? Promise.reject(new Error('private cancel failure')) : new Promise<void>(() => {}));
    const response = streaming([Buffer.alloc(16 * 1024 + 1)], false, cancel);
    fetchMock.mockResolvedValue(response);
    await rejectedOnce(createOwnedErgoMiningSubmissionControlV1().pause);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(response.body?.locked).toBe(false);
  });

  it('refuses an already aborted transport before decoding', async () => {
    const controller = new AbortController();
    timeoutSpy.mockReturnValue(controller.signal);
    const cancel = vi.fn();
    fetchMock.mockImplementation(async () => {
      controller.abort();
      return new Response(new ReadableStream({ cancel }));
    });
    await rejectedOnce(createOwnedErgoMiningSubmissionControlV1().pause);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('returns a deeply frozen bound watermark', async () => {
    fetchMock.mockImplementation(async (_url, init) => new Response(JSON.stringify({
      ...wire(init, 5), latestAppliedBlock: { headerId: 'ab'.repeat(32), height: 5 },
    })));
    const receipt = await createOwnedErgoMiningSubmissionControlV1(5).pause();
    expect(receipt.latestAppliedBlock).toEqual({ headerId: 'ab'.repeat(32), height: 5 });
    expect(Object.isFrozen(receipt.latestAppliedBlock)).toBe(true);
  });

  it.each(['operation', 'ceiling', 'above-cap', 'zero-cap', 'duplicate', 'nested-duplicate', 'extra', 'false', 'empty'])
    ('refuses single-fault wire %s without retry or disclosure', async (fault) => {
      fetchMock.mockImplementation(async (_url, init) => {
        const value = wire(init, fault === 'zero-cap' ? 0 : 5);
        if (fault === 'operation') value.operationId = 'ff'.repeat(32);
        if (fault === 'ceiling') value.maximumBlockHeight = null;
        if (fault === 'above-cap' || fault === 'zero-cap') value.latestAppliedBlock = { headerId: 'ab'.repeat(32), height: 6 };
        if (fault === 'extra') value.ownerNonce = new Headers(init?.headers).get('X-Ergo-Owned-Mining-Nonce');
        if (fault === 'false') value.submissionPaused = false;
        let text = JSON.stringify(value);
        if (fault === 'duplicate') text = text.replace('"submissionPaused":true', '"submissionPaused":true,"submissionPaused":true');
        if (fault === 'nested-duplicate') text = text.replace('"latestAppliedBlock":null', `"latestAppliedBlock":{"headerId":"${'ab'.repeat(32)}","height":1,"height":1}`);
        if (fault === 'empty') text = '';
        return new Response(text);
      });
      await rejectedOnce(createOwnedErgoMiningSubmissionControlV1(fault === 'zero-cap' ? 0 : 5).pause);
    });
});
