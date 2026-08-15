import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES,
} from './authenticated-spv-tracker-reconstruction.js';
import {
  AUTHENTICATED_TRACKER_NODE_INDEX_PAGE_SIZE,
  AUTHENTICATED_TRACKER_NODE_MAX_RESPONSE_BYTES,
  AuthenticatedSpvTrackerReadOnlyNodeClient,
  normalizeRootReadOnlyNodeEndpoint,
  readMatchingAuthenticatedSpvTrackerNodeNetwork,
} from './authenticated-spv-tracker-read-only-node-client.js';

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({ get: vi.fn() })),
  },
}));

beforeEach(() => vi.clearAllMocks());

describe('authenticated tracker read-only node client', () => {
  it('creates a credential-free GET-only client with fixed response and lineage bounds', () => {
    const client = new AuthenticatedSpvTrackerReadOnlyNodeClient('http://127.0.0.1:9053');

    expect(client).not.toHaveProperty('submitTransaction');
    expect(client).not.toHaveProperty('checkTransaction');
    expect(axios.create).toHaveBeenCalledWith({
      baseURL: 'http://127.0.0.1:9053',
      headers: {
        'Accept-Encoding': 'identity',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
      maxRedirects: 0,
      proxy: false,
      maxContentLength: AUTHENTICATED_TRACKER_NODE_MAX_RESPONSE_BYTES,
    });
  });

  it('rejects credentials, non-root routes, queries, and internal test endpoint markers', () => {
    const targets = [
      'http://user:pass@127.0.0.1:9053',
      'http://127.0.0.1:9053/node',
      'http://127.0.0.1:9053?api_key=redacted',
      'https://fixture-node.invalid',
    ];
    for (const target of targets) {
      expect(() => new AuthenticatedSpvTrackerReadOnlyNodeClient(target)).toThrow();
    }
    expect(axios.create).not.toHaveBeenCalled();
  });

  it('normalizes only explicit root http(s) origins', () => {
    expect(normalizeRootReadOnlyNodeEndpoint('https://node.example.test/', 'node'))
      .toBe('https://node.example.test');
    expect(() => normalizeRootReadOnlyNodeEndpoint('file:///node', 'node'))
      .toThrow(/http/i);
    expect(() => normalizeRootReadOnlyNodeEndpoint('https://node.example.test/path', 'node'))
      .toThrow(/root origin/i);
  });

  it('reads one bounded header-height identity set and rejects empty or duplicate results', async () => {
    const client = new AuthenticatedSpvTrackerReadOnlyNodeClient('http://127.0.0.1:9053');
    const headerId = 'ab'.repeat(32);
    (client as any).client = {
      get: async (path: string) => {
        expect(path).toBe('/blocks/at/1');
        return { data: JSON.stringify([headerId]) };
      },
    };
    await expect(client.getBlockHeaderIdsAtHeight(1)).resolves.toEqual([headerId]);

    (client as any).client = { get: async () => ({ data: JSON.stringify([]) }) };
    await expect(client.getBlockHeaderIdsAtHeight(1)).rejects.toThrow(/at least one/i);

    (client as any).client = {
      get: async () => ({ data: JSON.stringify([headerId, headerId]) }),
    };
    await expect(client.getBlockHeaderIdsAtHeight(1)).rejects.toThrow(/duplicate/i);
  });

  it('derives one address and pages unspent boxes through bounded GET requests', async () => {
    const client = new AuthenticatedSpvTrackerReadOnlyNodeClient('http://127.0.0.1:9053');
    const ergoTreeHex = `0008cd02${'22'.repeat(32)}`;
    const address = '4MQyMKvMbnCJG3aJ';
    const calls: Array<{ path: string; options?: any }> = [];
    (client as any).client = {
      get: async (path: string, options?: any) => {
        calls.push({ path, options });
        return path.startsWith('/utils/ergoTreeToAddress/')
          ? { data: JSON.stringify({ address }) }
          : { data: JSON.stringify([{ boxId: 'ab'.repeat(32) }]) };
      },
    };

    await expect(client.getAddressForErgoTree(ergoTreeHex)).resolves.toBe(address);
    await expect(client.getUnspentBoxesByAddressPage(address, {
      offset: 128,
      limit: 64,
    })).resolves.toEqual([{ boxId: 'ab'.repeat(32) }]);
    expect(calls).toEqual([
      {
        path: `/utils/ergoTreeToAddress/${ergoTreeHex}`,
        options: expect.objectContaining({
          timeout: 30_000,
          signal: expect.any(AbortSignal),
          responseType: 'arraybuffer',
          decompress: false,
          transformResponse: expect.any(Array),
        }),
      },
      {
        path: `/blockchain/box/unspent/byAddress/${address}`,
        options: expect.objectContaining({
          params: {
            offset: 128,
            limit: 64,
            sortDirection: 'asc',
            includeUnconfirmed: false,
            excludeMempoolSpent: true,
          },
          timeout: 30_000,
          signal: expect.any(AbortSignal),
          responseType: 'arraybuffer',
          decompress: false,
          transformResponse: expect.any(Array),
        }),
      },
    ]);
    expect((client as any).client.post).toBeUndefined();
  });

  it('rejects malformed or oversized address-box discovery responses', async () => {
    const client = new AuthenticatedSpvTrackerReadOnlyNodeClient('http://127.0.0.1:9053');
    (client as any).client = {
      get: async () => ({ data: JSON.stringify({ address: 'bad\naddress' }) }),
    };
    await expect(client.getAddressForErgoTree('00')).rejects.toThrow(/canonical address/i);
    await expect(client.getAddressForErgoTree('00'.repeat(16 * 1024 + 1)))
      .rejects.toThrow(/canonical lowercase hex/i);

    await expect(client.getUnspentBoxesByAddressPage('address', {
      offset: 0,
      limit: 501,
    })).rejects.toThrow(/must not exceed 500/i);
    (client as any).client = {
      get: async () => ({ data: JSON.stringify({ items: [] }) }),
    };
    await expect(client.getUnspentBoxesByAddressPage('address', {
      offset: 0,
      limit: 3,
    })).rejects.toThrow(/must be an array/i);
  });

  it('retrieves the complete stable indexed lineage with fixed pagination', async () => {
    const client = new AuthenticatedSpvTrackerReadOnlyNodeClient('http://127.0.0.1:9053');
    const tokenId = 'ab'.repeat(32);
    const calls: Array<{ path: string; options?: any }> = [];
    const firstPage = Array.from({ length: AUTHENTICATED_TRACKER_NODE_INDEX_PAGE_SIZE },
      (_, index) => ({ boxId: `box-${index}` }));
    (client as any).client = {
      get: async (path: string, options?: any) => {
        calls.push({ path, options });
        return options?.params?.offset === 0
          ? { data: JSON.stringify({ items: firstPage, total: 17 }) }
          : { data: JSON.stringify({ items: [{ boxId: 'box-16' }], total: 17 }) };
      },
    };

    await expect(client.getIndexedBoxesByTokenId(tokenId)).resolves.toHaveLength(17);
    expect(calls).toEqual([
      {
        path: `/blockchain/box/byTokenId/${tokenId}`,
        options: expect.objectContaining({
          params: { offset: 0, limit: AUTHENTICATED_TRACKER_NODE_INDEX_PAGE_SIZE },
          timeout: 30_000,
          signal: expect.any(AbortSignal),
          responseType: 'arraybuffer',
          decompress: false,
          transformResponse: expect.any(Array),
        }),
      },
      {
        path: `/blockchain/box/byTokenId/${tokenId}`,
        options: expect.objectContaining({
          params: { offset: 16, limit: AUTHENTICATED_TRACKER_NODE_INDEX_PAGE_SIZE },
          timeout: 30_000,
          signal: expect.any(AbortSignal),
          responseType: 'arraybuffer',
          decompress: false,
          transformResponse: expect.any(Array),
        }),
      },
    ]);
  });

  it('rejects oversized, drifting, and prematurely truncated lineage responses', async () => {
    const client = new AuthenticatedSpvTrackerReadOnlyNodeClient('http://127.0.0.1:9053');
    const tokenId = 'ab'.repeat(32);
    (client as any).client = {
      get: async () => ({
        data: JSON.stringify({
          items: [],
          total: AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES + 1,
        }),
      }),
    };
    await expect(client.getIndexedBoxesByTokenId(tokenId)).rejects.toThrow(/box bound/i);

    let calls = 0;
    const fullPage = Array.from(
      { length: AUTHENTICATED_TRACKER_NODE_INDEX_PAGE_SIZE },
      () => ({}),
    );
    (client as any).client = {
      get: async () => {
        calls += 1;
        return calls === 1
          ? { data: JSON.stringify({ items: fullPage, total: 17 }) }
          : { data: JSON.stringify({ items: [{}], total: 18 }) };
      },
    };
    await expect(client.getIndexedBoxesByTokenId(tokenId)).rejects.toThrow(/total changed/i);

    (client as any).client = {
      get: async () => ({ data: JSON.stringify({ items: [], total: 1 }) }),
    };
    await expect(client.getIndexedBoxesByTokenId(tokenId)).rejects.toThrow(/exactly 1 items/i);

  });

  it('rejects noncanonical page fields, oversized pages, and pagination deadline exhaustion', async () => {
    const tokenId = 'ab'.repeat(32);
    const schemaClient = new AuthenticatedSpvTrackerReadOnlyNodeClient('http://127.0.0.1:9053');
    (schemaClient as any).client = {
      get: async () => ({ data: JSON.stringify({ items: [], total: 0, extra: true }) }),
    };
    await expect(schemaClient.getIndexedBoxesByTokenId(tokenId)).rejects.toThrow(/canonical schema/i);

    const pageClient = new AuthenticatedSpvTrackerReadOnlyNodeClient('http://127.0.0.1:9053');
    (pageClient as any).client = {
      get: async () => ({
        data: JSON.stringify({
          items: Array.from(
            { length: AUTHENTICATED_TRACKER_NODE_INDEX_PAGE_SIZE + 1 },
            () => ({}),
          ),
          total: AUTHENTICATED_TRACKER_NODE_INDEX_PAGE_SIZE + 1,
        }),
      }),
    };
    await expect(pageClient.getIndexedBoxesByTokenId(tokenId)).rejects.toThrow(/exactly 16 items/i);

    let now = 0;
    const deadlineClient = new AuthenticatedSpvTrackerReadOnlyNodeClient(
      'http://127.0.0.1:9053',
      { now: () => now, paginationDeadlineMs: 100 },
    );
    (deadlineClient as any).client = {
      get: async () => {
        now = 101;
        return {
          data: JSON.stringify({
            items: Array.from(
              { length: AUTHENTICATED_TRACKER_NODE_INDEX_PAGE_SIZE },
              () => ({}),
            ),
            total: AUTHENTICATED_TRACKER_NODE_INDEX_PAGE_SIZE + 1,
          }),
        };
      },
    };
    await expect(deadlineClient.getIndexedBoxesByTokenId(tokenId))
      .rejects.toThrow(/aggregate deadline/i);

  });

  it('counts raw response bytes before JSON parsing and across every page', async () => {
    const client = new AuthenticatedSpvTrackerReadOnlyNodeClient(
      'http://127.0.0.1:9053',
      { maxLineageBytes: 64 },
    );
    (client as any).client = {
      get: async () => ({
        data: `${' '.repeat(65)}${JSON.stringify({ items: [], total: 0 })}`,
      }),
    };

    await expect(client.getIndexedBoxesByTokenId('ab'.repeat(32)))
      .rejects.toThrow(/64-byte bound/i);

    const firstPage = JSON.stringify({
      items: Array.from({ length: AUTHENTICATED_TRACKER_NODE_INDEX_PAGE_SIZE }, () => ({})),
      total: AUTHENTICATED_TRACKER_NODE_INDEX_PAGE_SIZE + 1,
    });
    const secondPage = JSON.stringify({ items: [{}], total: 17 });
    const aggregateBound = Buffer.byteLength(firstPage) + Buffer.byteLength(secondPage) - 1;
    const aggregateClient = new AuthenticatedSpvTrackerReadOnlyNodeClient(
      'http://127.0.0.1:9053',
      { maxLineageBytes: aggregateBound },
    );
    (aggregateClient as any).client = {
      get: async (_path: string, options: any) => ({
        data: options.params.offset === 0 ? firstPage : secondPage,
      }),
    };

    await expect(aggregateClient.getIndexedBoxesByTokenId('ab'.repeat(32)))
      .rejects.toThrow(new RegExp(`${aggregateBound}-byte bound`, 'i'));
  });

  it('requires both node identities to match the expected non-mainnet network', async () => {
    const source = (networks: string[]) => ({
      getInfo: vi.fn(async () => ({ network: networks.shift() })),
    }) as any;
    const primary = source(['testnet', 'testnet']);
    const witness = source(['testnet', 'devnet']);

    await expect(readMatchingAuthenticatedSpvTrackerNodeNetwork(
      primary,
      witness,
      'testnet',
    )).resolves.toBe('testnet');
    await expect(readMatchingAuthenticatedSpvTrackerNodeNetwork(
      primary,
      witness,
      'testnet',
    )).rejects.toThrow(/same non-mainnet network/i);
    await expect(readMatchingAuthenticatedSpvTrackerNodeNetwork(
      source(['devnet']),
      source(['devnet']),
      'testnet',
    )).rejects.toThrow(/expected Ergo node network testnet/i);
  });

  it('bounds complete reconstruction requests and caches transaction, header, and block lookups', async () => {
    const client = new AuthenticatedSpvTrackerReadOnlyNodeClient(
      'http://127.0.0.1:9053',
      { maxReconstructionRequests: 3 },
    );
    const id = 'cd'.repeat(32);
    const calls: string[] = [];
    (client as any).client = {
      get: async (path: string) => {
        calls.push(path);
        return { data: JSON.stringify({ id }) };
      },
    };

    client.beginAuthenticatedTrackerReconstruction();
    await expect(client.getTransaction(id)).resolves.toEqual({ id });
    await expect(client.getTransaction(id)).resolves.toEqual({ id });
    await expect(client.getBlockHeaderById(id)).resolves.toEqual({ id });
    await expect(client.getBlockByHeaderId(id)).resolves.toEqual({ id });
    await expect(client.getBlockByHeaderId(id)).resolves.toEqual({ id });
    await expect(client.getBoxByIdOrNull(id)).rejects.toThrow(/aggregate request bound/i);
    client.endAuthenticatedTrackerReconstruction();
    expect(calls).toEqual([
      `/blockchain/transaction/byId/${id}`,
      `/blocks/${id}/header`,
      `/blocks/${id}`,
    ]);
  });

  it('counts exact raw bytes and elapsed time across complete reconstruction requests', async () => {
    const first = JSON.stringify({ network: 'testnet' });
    const second = JSON.stringify({ indexedHeight: 120, fullHeight: 120 });
    const byteBound = Buffer.byteLength(first) + Buffer.byteLength(second) - 1;
    const byteClient = new AuthenticatedSpvTrackerReadOnlyNodeClient(
      'http://127.0.0.1:9053',
      { maxReconstructionBytes: byteBound },
    );
    (byteClient as any).client = {
      get: async (path: string) => ({ data: path === '/info' ? first : second }),
    };
    byteClient.beginAuthenticatedTrackerReconstruction();
    await expect(byteClient.getInfo()).resolves.toEqual({ network: 'testnet' });
    await expect(byteClient.getIndexedHeight())
      .rejects.toThrow(new RegExp(`${byteBound}-byte bound`, 'i'));
    byteClient.endAuthenticatedTrackerReconstruction();

    let now = 0;
    const deadlineClient = new AuthenticatedSpvTrackerReadOnlyNodeClient(
      'http://127.0.0.1:9053',
      { now: () => now, reconstructionDeadlineMs: 100 },
    );
    (deadlineClient as any).client = {
      get: async () => {
        now = 101;
        return { data: first };
      },
    };
    deadlineClient.beginAuthenticatedTrackerReconstruction();
    await expect(deadlineClient.getInfo()).rejects.toThrow(/aggregate deadline/i);
    deadlineClient.endAuthenticatedTrackerReconstruction();
  });

  it('counts raw 404 response bodies inside the complete reconstruction byte bound', async () => {
    const missingBody = 'not-found-response';
    const client = new AuthenticatedSpvTrackerReadOnlyNodeClient(
      'http://127.0.0.1:9053',
      { maxReconstructionBytes: Buffer.byteLength(missingBody) - 1 },
    );
    (client as any).client = {
      get: async () => ({ data: missingBody, status: 404 }),
    };

    client.beginAuthenticatedTrackerReconstruction();
    await expect(client.getBoxByIdOrNull('cd'.repeat(32)))
      .rejects.toThrow(/byte bound/i);
    client.endAuthenticatedTrackerReconstruction();
  });

  it('actively aborts a response that exceeds the remaining wall-clock deadline', async () => {
    const client = new AuthenticatedSpvTrackerReadOnlyNodeClient(
      'http://127.0.0.1:9053',
      { reconstructionDeadlineMs: 10 },
    );
    (client as any).client = {
      get: async (_path: string, options: any) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
    };

    client.beginAuthenticatedTrackerReconstruction();
    await expect(client.getInfo()).rejects.toThrow(/wall-clock.*aggregate deadline/i);
    client.endAuthenticatedTrackerReconstruction();
  });

  it('counts response-body bytes before UTF-8 decoding and rejects encoded bodies', async () => {
    const client = new AuthenticatedSpvTrackerReadOnlyNodeClient('http://127.0.0.1:9053');
    (client as any).client = {
      get: async () => ({
        data: Buffer.from(JSON.stringify({ network: 'testnet' }), 'utf8'),
        headers: { 'content-encoding': 'gzip' },
      }),
    };
    await expect(client.getInfo()).rejects.toThrow(/identity content encoding/i);

    (client as any).client = {
      get: async () => ({ data: Buffer.from([0xff]) }),
    };
    await expect(client.getInfo()).rejects.toThrow(/canonical UTF-8/i);
  });

  it('rejects duplicate keys in security-relevant node JSON', async () => {
    const client = new AuthenticatedSpvTrackerReadOnlyNodeClient('http://127.0.0.1:9053');
    (client as any).client = {
      get: async () => ({ data: '{"network":"testnet","network":"mainnet"}' }),
    };
    await expect(client.getInfo()).rejects.toThrow(/duplicate JSON object key: network/i);
  });

  it('uses only the bounded node routes and treats 404 object lookups as absent', async () => {
    const client = new AuthenticatedSpvTrackerReadOnlyNodeClient('http://127.0.0.1:9053');
    const id = 'cd'.repeat(32);
    const calls: string[] = [];
    (client as any).client = {
      get: async (path: string) => {
        calls.push(path);
        if (path === '/info') return { data: JSON.stringify({ network: 'testnet' }) };
        if (path === '/blockchain/indexedHeight') {
          return { data: JSON.stringify({ indexedHeight: 120, fullHeight: 120 }) };
        }
        if (path === '/blocks/lastHeaders/1') {
          return { data: JSON.stringify([{ id, height: 120 }]) };
        }
        return { data: 'not found', status: 404 };
      },
    };

    await expect(client.getInfo()).resolves.toEqual({ network: 'testnet' });
    await expect(client.getIndexedHeight()).resolves.toEqual({ indexedHeight: 120, fullHeight: 120 });
    await expect(client.getBestHeader()).resolves.toEqual({ id, height: 120 });
    await expect(client.getTransaction(id)).resolves.toBeNull();
    await expect(client.getBlockHeaderById(id)).resolves.toBeNull();
    await expect(client.getBoxByIdOrNull(id)).resolves.toBeNull();
    await expect(client.getBoxBinaryByIdOrNull(id)).resolves.toBeNull();
    expect(calls).toEqual([
      '/info',
      '/blockchain/indexedHeight',
      '/blocks/lastHeaders/1',
      `/blockchain/transaction/byId/${id}`,
      `/blocks/${id}/header`,
      `/utxo/byId/${id}`,
      `/utxo/byIdBinary/${id}`,
    ]);
  });
});
