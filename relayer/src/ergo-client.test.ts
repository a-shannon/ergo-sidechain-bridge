import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErgoClient } from './ergo-client.js';
import { encodeCollByteRegister, encodeLongRegister } from './ergo-helpers.js';

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
    })),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ErgoClient mempool queries', () => {
  it('uses authenticated headers by default for existing node operations', () => {
    new ErgoClient('http://unused.local');

    expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        api_key: expect.any(String),
        'Content-Type': 'application/json',
      }),
    }));
  });

  it('omits api_key headers in read-only mode', () => {
    new ErgoClient('http://unused.local', { readOnly: true });

    expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({
      headers: {
        'Content-Type': 'application/json',
      },
    }));
  });

  it('disables proxies and redirects for an explicitly direct read-only client', () => {
    new ErgoClient('http://127.0.0.1:9052', { readOnly: true, direct: true });

    expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({
      headers: {
        'Content-Type': 'application/json',
      },
      maxRedirects: 0,
      proxy: false,
    }));
  });

  it('binds a dedicated observer request timeout', () => {
    new ErgoClient('http://127.0.0.1:9052', {
      readOnly: true,
      direct: true,
      requestTimeoutMs: 1_500,
    });

    expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({
      timeout: 1_500,
    }));
  });

  it('forwards an observer abort signal to node reads', async () => {
    const client = new ErgoClient('http://127.0.0.1:9052', {
      readOnly: true,
      direct: true,
    });
    const controller = new AbortController();
    const get = vi.fn().mockResolvedValue({ data: { fullHeight: 42 } });
    (client as any).client = { get };

    await expect(client.getCurrentHeight(controller.signal)).resolves.toBe(42);
    expect(get).toHaveBeenCalledWith('/info', { signal: controller.signal });
  });

  it('reads and validates the active storage-rent parameter from node info', async () => {
    const client = new ErgoClient('http://127.0.0.1:9052', {
      readOnly: true,
      direct: true,
    });
    const get = vi.fn().mockResolvedValue({
      data: {
        fullHeight: 42,
        parameters: {
          height: 40,
          storageFeeFactor: 1_250_000,
        },
      },
    });
    (client as any).client = { get };

    await expect(client.getStorageRentParameters()).resolves.toEqual({
      fullHeight: 42,
      parameterHeight: 40,
      storageFeeFactorNanoErgPerByte: 1_250_000,
    });
    expect(get).toHaveBeenCalledWith('/info', { signal: undefined });
  });

  it('rejects malformed or future storage-rent parameters', async () => {
    const client = new ErgoClient('http://127.0.0.1:9052', {
      readOnly: true,
      direct: true,
    });
    (client as any).client = {
      get: vi.fn().mockResolvedValue({
        data: {
          fullHeight: 42,
          parameters: {
            height: 43,
            storageFeeFactor: 1_250_000,
          },
        },
      }),
    };
    await expect(client.getStorageRentParameters()).rejects.toThrow(
      /parameter activation height must not exceed/i,
    );

    (client as any).client.get.mockResolvedValue({
      data: {
        fullHeight: 42,
        parameters: {
          height: 40,
          storageFeeFactor: 0,
        },
      },
    });
    await expect(client.getStorageRentParameters()).rejects.toThrow(
      /storage fee factor/i,
    );

    for (const data of [
      {
        fullHeight: '42',
        parameters: { height: 40, storageFeeFactor: 1_250_000 },
      },
      {
        fullHeight: 42,
        parameters: { height: null, storageFeeFactor: 1_250_000 },
      },
      {
        fullHeight: 42,
        parameters: { height: '40', storageFeeFactor: 1_250_000 },
      },
      {
        fullHeight: 42,
        parameters: { height: 40, storageFeeFactor: true },
      },
      {
        fullHeight: 42,
        parameters: { height: 40, storageFeeFactor: '1250000' },
      },
    ]) {
      (client as any).client.get.mockResolvedValueOnce({ data });
      await expect(client.getStorageRentParameters()).rejects.toThrow(
        /must be/i,
      );
    }
  });

  it('bounds sorted unspent-box monitoring at the node request', async () => {
    const client = new ErgoClient('http://127.0.0.1:9052', {
      readOnly: true,
      direct: true,
    });
    const post = vi.fn().mockResolvedValue({
      data: [{ boxId: '11'.repeat(32) }],
    });
    (client as any).client = { post };
    const signal = new AbortController().signal;

    await expect(client.getUnspentBoxesByAddressPage('address', {
      offset: 0,
      limit: 129,
      sortDirection: 'asc',
    }, signal)).resolves.toHaveLength(1);
    expect(post).toHaveBeenCalledWith(
      '/blockchain/box/unspent/byAddress',
      '"address"',
      {
        params: {
          offset: 0,
          limit: 129,
          sortDirection: 'asc',
          includeUnconfirmed: false,
          excludeMempoolSpent: true,
        },
        signal,
      },
    );
  });

  it('rejects invalid or oversized unspent-box monitoring pages', async () => {
    const client = new ErgoClient('http://127.0.0.1:9052', {
      readOnly: true,
      direct: true,
    });
    const post = vi.fn().mockResolvedValue({
      data: Array.from({ length: 2 }, (_, index) => ({ boxId: String(index) })),
    });
    (client as any).client = { post };

    await expect(client.getUnspentBoxesByAddressPage('address', {
      offset: 0,
      limit: 1,
      sortDirection: 'asc',
    })).rejects.toThrow(/exceeds the requested bound/i);
    await expect(client.getUnspentBoxesByAddressPage('address', {
      offset: -1,
      limit: 1,
      sortDirection: 'asc',
    })).rejects.toThrow(/offset/i);
    await expect(client.getUnspentBoxesByAddressPage('address', {
      offset: 0,
      limit: 501,
      sortDirection: 'asc',
    })).rejects.toThrow(/limit/i);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed unspent-box monitoring page envelopes', async () => {
    const client = new ErgoClient('http://127.0.0.1:9052', {
      readOnly: true,
      direct: true,
    });
    const post = vi.fn();
    (client as any).client = { post };

    for (const data of [null, {}, { value: null }, { items: {} }]) {
      post.mockResolvedValueOnce({ data });
      await expect(client.getUnspentBoxesByAddressPage('address', {
        offset: 0,
        limit: 1,
        sortDirection: 'asc',
      })).rejects.toThrow(/must contain an array/i);
    }
    expect(post).toHaveBeenCalledTimes(4);
  });

  it('applies explicit response and indexed-lineage bounds for dedicated observers', () => {
    new ErgoClient('http://127.0.0.1:9052', {
      readOnly: true,
      direct: true,
      maxResponseBytes: 8 * 1024 * 1024,
      indexedTokenPageSize: 16,
      maxIndexedTokenBoxes: 16_385,
      maxIndexedTokenBytes: 64 * 1024 * 1024,
    });

    expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({
      maxContentLength: 8 * 1024 * 1024,
    }));
  });

  it('rejects credential-bearing node URLs before creating the HTTP client', () => {
    expect(() => new ErgoClient('http://user:pass@unused.local')).toThrow(
      'Ergo node URL must not include credentials or credential query parameters',
    );
    expect(() => new ErgoClient('https://unused.local?api_key=redacted')).toThrow(
      'Ergo node URL must not include credentials or credential query parameters',
    );
    expect(axios.create).not.toHaveBeenCalled();
  });

  it('does not expose a generic transaction submission capability', () => {
    const client = new ErgoClient('http://unused.local', { readOnly: true });

    expect((client as any).submitTransaction).toBeUndefined();
  });

  it('checks unconfirmed transactions across paginated node responses', async () => {
    const client = new ErgoClient('http://unused.local');
    const targetTxId = 'aa'.repeat(32);
    const calls: string[] = [];
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: `${String(index).padStart(2, '0')}${'11'.repeat(31)}` }));

    (client as any).client = {
      get: async (path: string) => {
        calls.push(path);
        if (path.includes('offset=0')) return { data: firstPage };
        return { data: [{ id: targetTxId }] };
      },
    };

    await expect(client.hasUnconfirmedTransaction(targetTxId)).resolves.toBe(true);
    expect(calls).toEqual([
      '/transactions/unconfirmed?limit=100&offset=0',
      '/transactions/unconfirmed?limit=100&offset=100',
    ]);
  });

  it('rejects malformed transaction ids before querying the node', async () => {
    const client = new ErgoClient('http://unused.local');
    const calls: string[] = [];
    (client as any).client = {
      get: async (path: string) => {
        calls.push(path);
        return { data: [] };
      },
    };

    await expect(client.hasUnconfirmedTransaction('not-hex')).rejects.toThrow(/32-byte hex/);
    expect(calls).toEqual([]);
  });

  it('retrieves the complete indexed token lineage across stable pages', async () => {
    const client = new ErgoClient('http://unused.local', { readOnly: true });
    const tokenId = 'ab'.repeat(32);
    const calls: string[] = [];
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ boxId: String(index) }));
    const secondPage = [{ boxId: '100' }];
    (client as any).client = {
      get: async (path: string) => {
        calls.push(path);
        return path.includes('offset=0')
          ? { data: { items: firstPage, total: 101 } }
          : { data: { items: secondPage, total: 101 } };
      },
    };

    await expect(client.getIndexedBoxesByTokenId(tokenId)).resolves.toHaveLength(101);
    expect(calls).toEqual([
      `/blockchain/box/byTokenId/${tokenId}?offset=0&limit=100`,
      `/blockchain/box/byTokenId/${tokenId}?offset=100&limit=100`,
    ]);
  });

  it('advances indexed token pagination by the number of rows actually returned', async () => {
    const client = new ErgoClient('http://unused.local', { readOnly: true });
    const tokenId = 'ab'.repeat(32);
    const calls: string[] = [];
    (client as any).client = {
      get: async (path: string) => {
        calls.push(path);
        return path.includes('offset=0')
          ? { data: { items: [{ boxId: '0' }, { boxId: '1' }], total: 3 } }
          : { data: { items: [{ boxId: '2' }], total: 3 } };
      },
    };

    await expect(client.getIndexedBoxesByTokenId(tokenId, 100)).resolves.toHaveLength(3);
    expect(calls).toEqual([
      `/blockchain/box/byTokenId/${tokenId}?offset=0&limit=100`,
      `/blockchain/box/byTokenId/${tokenId}?offset=2&limit=100`,
    ]);
  });

  it('rejects an indexed lineage total before accumulating rows beyond its bound', async () => {
    const client = new ErgoClient('http://unused.local', {
      readOnly: true,
      indexedTokenPageSize: 2,
      maxIndexedTokenBoxes: 2,
    });
    const tokenId = 'ab'.repeat(32);
    const calls: string[] = [];
    (client as any).client = {
      get: async (path: string) => {
        calls.push(path);
        return { data: { items: [{ boxId: '0' }, { boxId: '1' }], total: 3 } };
      },
    };

    await expect(client.getIndexedBoxesByTokenId(tokenId)).rejects.toThrow(/3.*2-box bound/i);
    expect(calls).toEqual([
      `/blockchain/box/byTokenId/${tokenId}?offset=0&limit=2`,
    ]);
  });

  it('rejects indexed lineage bytes before accumulating an oversized page', async () => {
    const client = new ErgoClient('http://unused.local', {
      readOnly: true,
      maxIndexedTokenBoxes: 10,
      maxIndexedTokenBytes: 16,
    });
    const tokenId = 'ab'.repeat(32);
    (client as any).client = {
      get: async () => ({
        data: { items: [{ boxId: 'oversized-page' }], total: 1 },
      }),
    };

    await expect(client.getIndexedBoxesByTokenId(tokenId)).rejects.toThrow(
      /16-byte accumulation bound/i,
    );
  });

  it('reads and validates extra-index progress', async () => {
    const client = new ErgoClient('http://unused.local', { readOnly: true });
    const calls: string[] = [];
    (client as any).client = {
      get: async (path: string) => {
        calls.push(path);
        return { data: { indexedHeight: 120, fullHeight: 120 } };
      },
    };
    await expect(client.getIndexedHeight()).resolves.toEqual({
      indexedHeight: 120,
      fullHeight: 120,
    });
    expect(calls).toEqual(['/blockchain/indexedHeight']);

    (client as any).client = {
      get: async () => ({ data: { indexedHeight: -1, fullHeight: 120 } }),
    };
    await expect(client.getIndexedHeight()).rejects.toThrow(/indexed height/i);
  });

  it('reads exact block headers and the current best header', async () => {
    const client = new ErgoClient('http://unused.local', { readOnly: true });
    const headerId = 'cd'.repeat(32);
    const header = { id: headerId, height: 120 };
    const calls: string[] = [];
    (client as any).client = {
      get: async (path: string) => {
        calls.push(path);
        return path.includes('lastHeaders') ? { data: [header] } : { data: header };
      },
    };

    await expect(client.getBlockHeaderById(headerId)).resolves.toEqual(header);
    await expect(client.getBestHeader()).resolves.toEqual(header);
    expect(calls).toEqual([
      `/blocks/${headerId}/header`,
      '/blocks/lastHeaders/1',
    ]);

    (client as any).client = {
      get: async () => { throw { response: { status: 404 } }; },
    };
    await expect(client.getBlockHeaderById(headerId)).resolves.toBeNull();
  });

  it('rejects a drifting or prematurely truncated indexed token snapshot', async () => {
    const client = new ErgoClient('http://unused.local', { readOnly: true });
    const tokenId = 'ab'.repeat(32);
    let calls = 0;
    (client as any).client = {
      get: async () => {
        calls++;
        return calls === 1
          ? { data: { items: Array.from({ length: 100 }, () => ({})), total: 101 } }
          : { data: { items: [], total: 102 } };
      },
    };
    await expect(client.getIndexedBoxesByTokenId(tokenId)).rejects.toThrow(/total changed/i);

    (client as any).client = {
      get: async () => ({ data: { items: [], total: 1 } }),
    };
    await expect(client.getIndexedBoxesByTokenId(tokenId)).rejects.toThrow(/ended before total/i);
  });

  it('counts the inclusion block and parses all v3 peg-in provenance registers', async () => {
    const client = new ErgoClient('http://unused.local');
    const depositorTree = '0008cd02' + '66'.repeat(32);
    (client as any).client = {
      post: async () => ({
        data: [{
          boxId: '11'.repeat(32),
          value: 5_000_000,
          creationHeight: 100,
          transactionId: '22'.repeat(32),
          additionalRegisters: {
            R4: encodeCollByteRegister(Buffer.from('77'.repeat(20), 'hex')),
            R5: encodeLongRegister(5_000_000),
            R6: encodeCollByteRegister(Buffer.from('02' + '88'.repeat(32), 'hex')),
            R7: encodeCollByteRegister(Buffer.from(depositorTree, 'hex')),
          },
        }],
      }),
    };

    await expect(client.scanForPegIns('unused', 10, 109)).resolves.toEqual([
      expect.objectContaining({
        boxId: '11'.repeat(32),
        confirmations: 10,
        targetEvmAddress: '0x' + '77'.repeat(20),
        depositorErgoTreeHex: depositorTree,
        hasValidRegisters: true,
      }),
    ]);
  });

  it('returns null only for a confirmed UTXO 404', async () => {
    const client = new ErgoClient('http://unused.local');
    (client as any).client = {
      get: async () => {
        const error: any = new Error('not found');
        error.response = { status: 404 };
        throw error;
      },
    };
    await expect(client.getBoxByIdOrNull('11'.repeat(32))).resolves.toBeNull();
  });
});
