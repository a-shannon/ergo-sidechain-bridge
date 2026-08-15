import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTHENTICATED_V2_VAULT_ADDRESS_PAGE_SIZE,
  AuthenticatedV2VaultReadOnlyNodeClient,
} from './authenticated-v2-vault-read-only-node-client.js';
import { AUTHENTICATED_V2_VAULT_MAX_BOXES } from './authenticated-v2-vault-reconstruction.js';

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({ get: vi.fn(), post: vi.fn() })),
  },
}));

beforeEach(() => vi.clearAllMocks());

const ADDRESS = `9${'A'.repeat(50)}`;

describe('authenticated V2 vault read-only node client', () => {
  it('exposes bounded read surfaces without wallet, checker, or submission capabilities', () => {
    const client = new AuthenticatedV2VaultReadOnlyNodeClient('http://127.0.0.1:9053');

    expect(client).not.toHaveProperty('submitTransaction');
    expect(client).not.toHaveProperty('checkTransaction');
    expect(client).not.toHaveProperty('signTransaction');
    expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: 'http://127.0.0.1:9053',
      maxRedirects: 0,
      proxy: false,
    }));
  });

  it('retrieves complete indexed and current address sets with fixed pagination', async () => {
    const client = new AuthenticatedV2VaultReadOnlyNodeClient('http://127.0.0.1:9053');
    const first = Array.from({ length: AUTHENTICATED_V2_VAULT_ADDRESS_PAGE_SIZE },
      (_, index) => ({ boxId: `box-${index}` }));
    const calls: Array<{ path: string; body: string; options: any }> = [];
    (client as any).client = {
      post: async (path: string, body: string, options: any) => {
        calls.push({ path, body, options });
        return {
          data: JSON.stringify(options.params.offset === 0
            ? { items: first, total: 17 }
            : { items: [{ boxId: 'box-16' }], total: 17 }),
        };
      },
    };

    await expect(client.getIndexedBoxesByAddress(ADDRESS)).resolves.toHaveLength(17);
    await expect(client.getUnspentBoxesByAddress(ADDRESS)).resolves.toHaveLength(17);
    expect(calls.map(call => call.path)).toEqual([
      '/blockchain/box/byAddress',
      '/blockchain/box/byAddress',
      '/blockchain/box/unspent/byAddress',
      '/blockchain/box/unspent/byAddress',
    ]);
    for (const call of calls) {
      expect(call.body).toBe(JSON.stringify(ADDRESS));
      expect(call.options).toEqual(expect.objectContaining({
        timeout: 30_000,
        signal: expect.any(AbortSignal),
        responseType: 'arraybuffer',
        decompress: false,
        transformResponse: expect.any(Array),
      }));
      expect(call.options.params).toEqual(expect.objectContaining({
        limit: AUTHENTICATED_V2_VAULT_ADDRESS_PAGE_SIZE,
        sortDirection: 'asc',
        includeUnconfirmed: false,
        excludeMempoolSpent: false,
      }));
    }
  });

  it('rejects malformed, drifting, truncated, and oversized address pages', async () => {
    const client = new AuthenticatedV2VaultReadOnlyNodeClient('http://127.0.0.1:9053');
    (client as any).client = {
      post: async () => ({ data: JSON.stringify({ items: [], total: 0, extra: true }) }),
    };
    await expect(client.getIndexedBoxesByAddress(ADDRESS)).rejects.toThrow(/canonical schema/i);

    let calls = 0;
    (client as any).client = {
      post: async () => {
        calls += 1;
        return {
          data: JSON.stringify(calls === 1
            ? {
              items: Array.from({ length: AUTHENTICATED_V2_VAULT_ADDRESS_PAGE_SIZE }, () => ({})),
              total: 17,
            }
            : { items: [{}], total: 18 }),
        };
      },
    };
    await expect(client.getIndexedBoxesByAddress(ADDRESS)).rejects.toThrow(/total changed/i);

    (client as any).client = {
      post: async () => ({ data: JSON.stringify({ items: [], total: 1 }) }),
    };
    await expect(client.getUnspentBoxesByAddress(ADDRESS)).rejects.toThrow(/exactly 1 items/i);

    (client as any).client = {
      post: async () => ({
        data: JSON.stringify({ items: [], total: AUTHENTICATED_V2_VAULT_MAX_BOXES + 1 }),
      }),
    };
    await expect(client.getIndexedBoxesByAddress(ADDRESS)).rejects.toThrow(/box bound/i);

    (client as any).client = {
      post: async () => ({ data: '{"items":[],"total":0,"total":1}' }),
    };
    await expect(client.getUnspentBoxesByAddress(ADDRESS))
      .rejects.toThrow(/duplicate JSON object key: total/i);
  });

  it('applies raw-byte, aggregate-request, deadline, encoding, and address bounds', async () => {
    const bytes = JSON.stringify({ items: [], total: 0 });
    const byteClient = new AuthenticatedV2VaultReadOnlyNodeClient(
      'http://127.0.0.1:9053',
      { maxAddressBytes: Buffer.byteLength(bytes) - 1 },
    );
    (byteClient as any).client = { post: async () => ({ data: bytes }) };
    await expect(byteClient.getIndexedBoxesByAddress(ADDRESS)).rejects.toThrow(/byte bound/i);

    const requestClient = new AuthenticatedV2VaultReadOnlyNodeClient(
      'http://127.0.0.1:9053',
      { maxReconstructionRequests: 1 },
    );
    (requestClient as any).client = { post: async () => ({ data: bytes }) };
    requestClient.beginAuthenticatedTrackerReconstruction();
    await expect(requestClient.getIndexedBoxesByAddress(ADDRESS)).resolves.toEqual([]);
    await expect(requestClient.getUnspentBoxesByAddress(ADDRESS))
      .rejects.toThrow(/aggregate request bound/i);
    requestClient.endAuthenticatedTrackerReconstruction();

    let now = 0;
    const deadlineClient = new AuthenticatedV2VaultReadOnlyNodeClient(
      'http://127.0.0.1:9053',
      { now: () => now, addressDeadlineMs: 10 },
    );
    (deadlineClient as any).client = {
      post: async () => {
        now = 11;
        return { data: bytes };
      },
    };
    await expect(deadlineClient.getIndexedBoxesByAddress(ADDRESS))
      .rejects.toThrow(/aggregate deadline/i);

    const encodedClient = new AuthenticatedV2VaultReadOnlyNodeClient(
      'http://127.0.0.1:9053',
    );
    (encodedClient as any).client = {
      post: async () => ({ data: bytes, headers: { 'content-encoding': 'gzip' } }),
    };
    await expect(encodedClient.getIndexedBoxesByAddress(ADDRESS))
      .rejects.toThrow(/identity content encoding/i);
    await expect(encodedClient.getIndexedBoxesByAddress('not an address'))
      .rejects.toThrow(/base58/i);
  });

});
