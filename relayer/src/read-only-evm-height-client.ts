import { validateReadOnlyNodeUrl } from './read-only-node-url.js';

export interface ReadOnlyEvmHeightClient {
  getBlockNumber(): Promise<number>;
}

export function validateReadOnlyEvmRpcUrl(rpcUrl: string | undefined): string[] {
  return validateReadOnlyNodeUrl(rpcUrl, 'fresh testnet checkpoint: sidechain RPC URL');
}

export function createReadOnlyEvmHeightClient(
  rpcUrl: string,
  fetchImpl: typeof fetch = fetch,
): ReadOnlyEvmHeightClient {
  const errors = validateReadOnlyEvmRpcUrl(rpcUrl);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  return {
    async getBlockNumber(): Promise<number> {
      const response = await fetchImpl(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: [],
        }),
      });
      if (!response.ok) {
        throw new Error(`read-only EVM height request failed with HTTP ${response.status}`);
      }
      const body = await response.json() as { result?: unknown; error?: { message?: string } };
      if (body.error) {
        throw new Error(`read-only EVM height request failed: ${body.error.message ?? 'RPC error'}`);
      }
      if (typeof body.result !== 'string' || !/^0x[0-9a-f]+$/i.test(body.result)) {
        throw new Error('read-only EVM height request returned an invalid block number');
      }
      const blockNumber = Number.parseInt(body.result, 16);
      if (!Number.isSafeInteger(blockNumber) || blockNumber < 0) {
        throw new Error('read-only EVM height request returned an unsafe block number');
      }
      return blockNumber;
    },
  };
}
