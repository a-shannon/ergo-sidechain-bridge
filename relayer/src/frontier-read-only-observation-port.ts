import type { Block, TransactionReceipt } from 'ethers';

export interface FrontierReadOnlyObservationPort {
  getBlockNumber(): Promise<number>;
  getBlock(blockTag: number | 'latest'): Promise<Block | null>;
  getTransactionReceipt(transactionHash: string): Promise<TransactionReceipt | null>;
  getBlockReceipts(blockNumber: number): Promise<unknown>;
}

interface FrontierReadOnlyBackend {
  getBlockNumber(): Promise<number>;
  getBlock(blockTag: number | 'latest'): Promise<Block | null>;
  getTransactionReceipt(transactionHash: string): Promise<TransactionReceipt | null>;
  send(method: string, params: unknown[]): Promise<unknown>;
}

/**
 * Narrow a Frontier provider to the exact read operations used by the relayer.
 * The generic JSON-RPC method never crosses this boundary.
 */
export function createFrontierReadOnlyObservationPort(
  backend: FrontierReadOnlyBackend,
): FrontierReadOnlyObservationPort {
  return Object.freeze({
    getBlockNumber: () => backend.getBlockNumber(),
    getBlock: (blockTag: number | 'latest') => backend.getBlock(blockTag),
    getTransactionReceipt: (transactionHash: string) =>
      backend.getTransactionReceipt(transactionHash),
    getBlockReceipts: (blockNumber: number) => {
      if (!Number.isSafeInteger(blockNumber) || blockNumber < 0) {
        throw new Error('Frontier block-receipt height must be a non-negative safe integer');
      }
      return backend.send('eth_getBlockReceipts', [`0x${blockNumber.toString(16)}`]);
    },
  });
}
