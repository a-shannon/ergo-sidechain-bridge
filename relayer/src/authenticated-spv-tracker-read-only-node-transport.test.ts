import { createServer, type RequestListener } from 'node:http';
import type { Socket } from 'node:net';
import { describe, expect, it } from 'vitest';
import { AuthenticatedSpvTrackerReadOnlyNodeClient } from './authenticated-spv-tracker-read-only-node-client.js';

async function withNode(handler: RequestListener, run: (origin: string) => Promise<void>): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing loopback listener');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    server.closeAllConnections();
    await closed;
  }
}

describe('read-only node HTTP transport on owned loopback', () => {
  it('uses fresh connections when the peer resets a reused connection', async () => {
    const sockets = new Set<Socket>();
    let requests = 0;
    await withNode((request, response) => {
      requests++;
      if (sockets.has(request.socket)) {
        request.socket.resetAndDestroy();
        return;
      }
      sockets.add(request.socket);
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify([{ height: requests, id: 'ab'.repeat(32) }]));
    }, async origin => {
      const client = new AuthenticatedSpvTrackerReadOnlyNodeClient(origin);
      await expect(client.getBestHeader()).resolves.toMatchObject({ height: 1 });
      await expect(client.getBestHeader()).resolves.toMatchObject({ height: 2 });
      await expect(client.getBestHeader()).resolves.toMatchObject({ height: 3 });
    });
    expect(requests).toBe(3);
    expect(sockets.size).toBe(3);
  });

  it('does not share idle connections across separate observation clients', async () => {
    const sockets = new Set<Socket>();
    const methods: string[] = [];
    const connections: string[] = [];
    await withNode((request, response) => {
      sockets.add(request.socket);
      methods.push(request.method!);
      connections.push(request.headers.connection!);
      response.end('{"network":"devnet"}');
    }, async origin => {
      const first = new AuthenticatedSpvTrackerReadOnlyNodeClient(origin);
      const second = new AuthenticatedSpvTrackerReadOnlyNodeClient(origin);
      await expect(first.getInfo()).resolves.toEqual({ network: 'devnet' });
      await expect(second.getInfo()).resolves.toEqual({ network: 'devnet' });
      await expect(first.getInfo()).resolves.toEqual({ network: 'devnet' });
    });
    expect(sockets.size).toBe(3);
    expect(methods).toEqual(['GET', 'GET', 'GET']);
    expect(connections).toEqual(['close', 'close', 'close']);
  });

  it('rejects a reset on a new connection without retry or an absent-box result', async () => {
    let requests = 0;
    await withNode(request => {
      requests++;
      request.socket.resetAndDestroy();
    }, async origin => {
      const client = new AuthenticatedSpvTrackerReadOnlyNodeClient(origin);
      await expect(client.getBoxByIdOrNull('ab'.repeat(32))).rejects.toMatchObject({ code: 'ECONNRESET' });
    });
    expect(requests).toBe(1);
  });

  it('rejects a truncated response without retry or accepting partial JSON', async () => {
    let requests = 0;
    await withNode((request, response) => {
      requests++;
      response.setHeader('Content-Length', '100');
      response.write('{"network":', () => request.socket.resetAndDestroy());
    }, async origin => {
      await expect(new AuthenticatedSpvTrackerReadOnlyNodeClient(origin).getInfo()).rejects.toThrow();
    });
    expect(requests).toBe(1);
  });

  it('preserves bounded reconstruction requests across fresh connections', async () => {
    let requests = 0;
    await withNode((_request, response) => {
      requests++;
      response.end('{"network":"devnet"}');
    }, async origin => {
      const client = new AuthenticatedSpvTrackerReadOnlyNodeClient(origin, { maxReconstructionRequests: 1 });
      client.beginAuthenticatedTrackerReconstruction();
      await expect(client.getInfo()).resolves.toEqual({ network: 'devnet' });
      await expect(client.getInfo()).rejects.toThrow(/request bound/);
      client.endAuthenticatedTrackerReconstruction();
    });
    expect(requests).toBe(1);
  });

  it.each([503, 302])('rejects HTTP %s without retry or redirection', async status => {
    let requests = 0;
    await withNode((_request, response) => {
      requests++;
      response.statusCode = status;
      response.setHeader('Location', '/info');
      response.end('{"network":"devnet"}');
    }, async origin => {
      await expect(new AuthenticatedSpvTrackerReadOnlyNodeClient(origin).getInfo()).rejects.toMatchObject({ status });
    });
    expect(requests).toBe(1);
  });
});
