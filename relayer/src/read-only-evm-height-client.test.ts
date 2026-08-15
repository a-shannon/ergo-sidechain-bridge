import { describe, expect, it, vi } from 'vitest';

import {
  createReadOnlyEvmHeightClient,
  validateReadOnlyEvmRpcUrl,
} from './read-only-evm-height-client.js';

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('read-only EVM height client', () => {
  it('only sends an eth_blockNumber JSON-RPC request', async () => {
    const fetchMock = vi.fn(async () => response({ jsonrpc: '2.0', id: 1, result: '0x12c' }));
    const client = createReadOnlyEvmHeightClient('http://127.0.0.1:9945', fetchMock as any);

    await expect(client.getBlockNumber()).resolves.toBe(300);
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:9945', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber',
        params: [],
      }),
    });
    expect(Object.keys(client)).toEqual(['getBlockNumber']);
  });

  it('rejects credential-bearing RPC URLs without echoing the raw target', () => {
    const target = 'http://user:pass@127.0.0.1:9945';
    const errors = validateReadOnlyEvmRpcUrl(target);

    expect(errors).toEqual([
      'fresh testnet checkpoint: sidechain RPC URL must not include credentials or credential query parameters',
    ]);
    expect(errors.join('\n')).not.toContain(target);
    expect(() => createReadOnlyEvmHeightClient(target)).toThrow(
      'fresh testnet checkpoint: sidechain RPC URL must not include credentials or credential query parameters',
    );
  });

  it('rejects malformed or unsafe block number responses', async () => {
    const malformed = createReadOnlyEvmHeightClient(
      'http://127.0.0.1:9945',
      vi.fn(async () => response({ result: 'not-hex' })) as any,
    );
    const rpcError = createReadOnlyEvmHeightClient(
      'http://127.0.0.1:9945',
      vi.fn(async () => response({ error: { message: 'denied' } })) as any,
    );

    await expect(malformed.getBlockNumber()).rejects.toThrow(
      'read-only EVM height request returned an invalid block number',
    );
    await expect(rpcError.getBlockNumber()).rejects.toThrow(
      'read-only EVM height request failed: denied',
    );
  });
});
