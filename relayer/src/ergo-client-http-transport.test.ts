import { createServer, type RequestListener } from 'node:http';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { BoundedProcessExitError, runBoundedProcess } from './bounded-process-runner.js';
import { ErgoClient } from './ergo-client.js';
import { ncheck } from './ergo-helpers.js';

async function withServer(handler: RequestListener, run: (origin: string) => Promise<void>): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing owned HTTP listener');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    server.closeAllConnections();
    await closed;
  }
}

function client(origin: string, options: { maxResponseBytes?: number } = {}): ErgoClient {
  return new ErgoClient(origin, { readOnly: true, direct: true, requestTimeoutMs: 1_000, ...options });
}

describe('ErgoClient installed Axios HTTP transport', () => {
  it('performs the intended GET without an API credential', async () => {
    const seen: unknown[] = [];
    await withServer((request, response) => {
      seen.push([request.method, request.url, request.headers.api_key]);
      response.setHeader('Content-Type', 'application/json');
      response.end('{"fullHeight":42,"network":"devnet"}');
    }, async origin => {
      await expect(client(origin).getInfo()).resolves.toEqual({ fullHeight: 42, network: 'devnet' });
    });
    expect(seen).toEqual([['GET', '/info', undefined]]);
  });

  it('sends exact credential-free check-only JSON through the existing helper', async () => {
    // A transport fixture only: the owned HTTP peer does not validate a transaction.
    const body = { inputs: [], dataInputs: [], outputs: [] };
    const seen: unknown[] = [];
    await withServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', chunk => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        seen.push([request.method, request.url, request.headers.api_key,
          request.headers['content-type'], Buffer.concat(chunks).toString('utf8')]);
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify('ab'.repeat(32)));
      });
    }, async origin => {
      await expect(ncheck('/transactions/check', body, origin)).resolves.toBe('ab'.repeat(32));
    });
    expect(seen).toEqual([['POST', '/transactions/check', undefined, 'application/json', JSON.stringify(body)]]);
  });

  it('refuses a redirect without contacting the second owned listener', async () => {
    let initialRequests = 0;
    let redirectedRequests = 0;
    await withServer((_request, response) => {
      redirectedRequests++;
      response.end('{"fullHeight":99,"network":"devnet"}');
    }, async sink => {
      await withServer((_request, response) => {
        initialRequests++;
        response.writeHead(302, { Location: `${sink}/info` });
        response.end();
      }, async origin => {
        await expect(client(origin).getInfo()).rejects.toMatchObject({ response: { status: 302 } });
      });
    });
    expect([initialRequests, redirectedRequests]).toEqual([1, 0]);
  });

  it('refuses a server error without retry', async () => {
    let requests = 0;
    await withServer((_request, response) => {
      requests++;
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end('{"fullHeight":42,"network":"devnet"}');
    }, async origin => {
      await expect(client(origin).getInfo()).rejects.toMatchObject({ response: { status: 503 } });
    });
    expect(requests).toBe(1);
  });

  it('enforces the configured response byte bound', async () => {
    let requests = 0;
    await withServer((_request, response) => {
      requests++;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ fullHeight: 42, network: 'devnet', padding: 'x'.repeat(256) }));
    }, async origin => {
      await expect(client(origin, { maxResponseBytes: 64 }).getInfo()).rejects.toMatchObject({ code: 'ERR_BAD_RESPONSE' });
    });
    expect(requests).toBe(1);
  });

  it('honors an in-flight AbortSignal without retry', async () => {
    const controller = new AbortController();
    let requests = 0;
    await withServer(() => {
      requests++;
      controller.abort();
    }, async origin => {
      await expect(client(origin).getInfo(controller.signal)).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    });
    expect(requests).toBe(1);
  });

  it('ignores an inherited createConnection hook in an isolated actual-client process', async () => {
    // GHSA-m8m8-qj5v-23w3: never pollute the Vitest/RPC process or replace the adapter.
    const source = `
      import assert from 'node:assert/strict';
      import { createServer } from 'node:http';
      import { ErgoClient } from ${JSON.stringify(new URL('./ergo-client.ts', import.meta.url).href)};
      const original = Object.getOwnPropertyDescriptor(Object.prototype, 'createConnection');
      assert.equal(original, undefined);
      let hookCalls = 0;
      let requests = 0;
      const seen = [];
      const server = createServer((request, response) => {
        requests++;
        seen.push([request.method, request.url, request.headers.api_key]);
        response.setHeader('Content-Type', 'application/json');
        response.end('{"fullHeight":42,"network":"devnet"}');
      });
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      try {
        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        Object.defineProperty(Object.prototype, 'createConnection', {
          configurable: true, enumerable: true, writable: true,
          value() { hookCalls++; throw new Error('inherited connection hook invoked'); },
        });
        const client = new ErgoClient('http://127.0.0.1:' + address.port,
          { readOnly: true, direct: true, requestTimeoutMs: 1000, maxResponseBytes: 1024 });
        assert.deepEqual(await client.getInfo(), { fullHeight: 42, network: 'devnet' });
        assert.equal(hookCalls, 0);
        assert.equal(requests, 1);
        assert.deepEqual(seen, [['GET', '/info', undefined]]);
      } finally {
        if (original === undefined) delete Object.prototype.createConnection;
        else Object.defineProperty(Object.prototype, 'createConnection', original);
        const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        server.closeAllConnections();
        await closed;
      }
      assert.equal(Object.getOwnPropertyDescriptor(Object.prototype, 'createConnection'), original);
      process.stdout.write(JSON.stringify({ hookCalls, requests, restored: true }));
    `;
    const result = await runBoundedProcess({
      executablePath: process.execPath,
      args: ['--import', new URL('../node_modules/tsx/dist/loader.mjs', import.meta.url).href,
        '--input-type=module', '--eval', source],
      cwd: tmpdir(),
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
        TEMP: process.env.TEMP, TMP: process.env.TMP, TSX_DISABLE_CACHE: '1' },
      timeoutMs: 5_000,
      terminationGraceMs: 1_000,
      maxOutputBytes: 16 * 1024,
      label: 'isolated ErgoClient inherited connection hook',
    }).catch((error: unknown) => {
      if (error instanceof BoundedProcessExitError) {
        throw new Error(`isolated HTTP child exited ${error.exitCode}; stdout=${error.stdout.slice(0, 4096)}; stderr=${error.stderr.slice(0, 8192)}`,
          { cause: error });
      }
      throw error;
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({ hookCalls: 0, requests: 1, restored: true });
    expect(Object.getOwnPropertyDescriptor(Object.prototype, 'createConnection')).toBeUndefined();
  }, 10_000);
});
