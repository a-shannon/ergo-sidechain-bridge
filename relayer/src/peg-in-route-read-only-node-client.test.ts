import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PegInRouteReadOnlyNodeClient,
} from './peg-in-route-read-only-node-client.js';

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({ get: vi.fn(), post: vi.fn() })),
  },
}));

beforeEach(() => vi.clearAllMocks());

const ADDRESS = `9${'A'.repeat(50)}`;

describe('peg-in route read-only node client', () => {
  it('exposes only observation and deterministic compilation surfaces', () => {
    const client = new PegInRouteReadOnlyNodeClient('http://127.0.0.1:9053');
    expect(client).toHaveProperty('compileP2sAddress');
    expect(client).toHaveProperty('getIndexedBoxesByAddress');
    expect(client).not.toHaveProperty('checkTransaction');
    expect(client).not.toHaveProperty('signTransaction');
    expect(client).not.toHaveProperty('submitTransaction');
    expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: 'http://127.0.0.1:9053',
      maxRedirects: 0,
      proxy: false,
    }));
  });

  it('posts only the bounded source and tree version to P2S compilation', async () => {
    const client = new PegInRouteReadOnlyNodeClient('http://127.0.0.1:9053');
    const calls: any[] = [];
    (client as any).client = {
      post: async (...args: any[]) => {
        calls.push(args);
        return { data: JSON.stringify({ address: ADDRESS }), status: 200, headers: {} };
      },
    };
    await expect(client.compileP2sAddress('{ sigmaProp(true) }')).resolves.toBe(ADDRESS);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('/script/p2sAddress');
    expect(calls[0][1]).toEqual({ source: '{ sigmaProp(true) }', treeVersion: 0 });
    expect(calls[0][2]).toEqual(expect.objectContaining({
      timeout: 30_000,
      signal: expect.any(AbortSignal),
      responseType: 'arraybuffer',
      decompress: false,
      transformResponse: expect.any(Array),
    }));
  });

  it('rejects duplicate, extra, encoded, oversized, or malformed responses', async () => {
    const client = new PegInRouteReadOnlyNodeClient('http://127.0.0.1:9053');
    (client as any).client = {
      post: async () => ({ data: `{"address":"${ADDRESS}","address":"${ADDRESS}"}` }),
    };
    await expect(client.compileP2sAddress('source')).rejects.toThrow('duplicate JSON object key');

    (client as any).client = {
      post: async () => ({ data: JSON.stringify({ address: ADDRESS, tree: '00' }) }),
    };
    await expect(client.compileP2sAddress('source')).rejects.toThrow('exactly address');

    (client as any).client = {
      post: async () => ({
        data: JSON.stringify({ address: ADDRESS }),
        headers: { 'content-encoding': 'gzip' },
      }),
    };
    await expect(client.compileP2sAddress('source')).rejects.toThrow('identity content encoding');

    const small = new PegInRouteReadOnlyNodeClient(
      'http://127.0.0.1:9053',
      { maxCompileResponseBytes: 4 },
    );
    (small as any).client = {
      post: async () => ({ data: JSON.stringify({ address: ADDRESS }) }),
    };
    await expect(small.compileP2sAddress('source')).rejects.toThrow('response exceeds');
  });

  it('rejects empty, NUL-bearing, and oversized sources before any request', async () => {
    const client = new PegInRouteReadOnlyNodeClient(
      'http://127.0.0.1:9053',
      { maxCompileSourceBytes: 5 },
    );
    const post = vi.fn();
    (client as any).client = { post };
    await expect(client.compileP2sAddress('')).rejects.toThrow('non-empty');
    await expect(client.compileP2sAddress('a\0b')).rejects.toThrow('NUL');
    await expect(client.compileP2sAddress('123456')).rejects.toThrow('source exceeds');
    expect(post).not.toHaveBeenCalled();
  });

  it('shares the aggregate request budget with address-index observation', async () => {
    const client = new PegInRouteReadOnlyNodeClient(
      'http://127.0.0.1:9053',
      { maxReconstructionRequests: 1 },
    );
    (client as any).client = {
      post: async () => ({ data: JSON.stringify({ address: ADDRESS }) }),
    };
    client.beginAuthenticatedTrackerReconstruction();
    await expect(client.compileP2sAddress('source')).resolves.toBe(ADDRESS);
    await expect(client.compileP2sAddress('source')).rejects.toThrow('aggregate request bound');
    client.endAuthenticatedTrackerReconstruction();
  });
});
