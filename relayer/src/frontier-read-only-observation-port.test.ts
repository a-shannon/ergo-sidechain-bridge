import { describe, expect, it, vi } from 'vitest';

import { createFrontierReadOnlyObservationPort } from './frontier-read-only-observation-port.js';

describe('Frontier read-only observation port', () => {
  it('exposes only bounded read operations and translates block-receipt reads', async () => {
    const backend = {
      getBlockNumber: vi.fn(async () => 17),
      getBlock: vi.fn(async () => null),
      getTransactionReceipt: vi.fn(async () => null),
      send: vi.fn(async () => []),
    };

    const port = createFrontierReadOnlyObservationPort(backend);

    expect(Object.isFrozen(port)).toBe(true);
    expect(Object.keys(port).sort()).toEqual([
      'getBlock',
      'getBlockNumber',
      'getBlockReceipts',
      'getTransactionReceipt',
    ]);
    expect('send' in port).toBe(false);
    expect('sendTransaction' in port).toBe(false);
    expect('broadcastTransaction' in port).toBe(false);

    await expect(port.getBlockNumber()).resolves.toBe(17);
    await expect(port.getBlockReceipts(31)).resolves.toEqual([]);
    expect(backend.send).toHaveBeenCalledOnce();
    expect(backend.send).toHaveBeenCalledWith('eth_getBlockReceipts', ['0x1f']);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid block-receipt height %s before RPC',
    async blockNumber => {
      const backend = {
        getBlockNumber: vi.fn(async () => 0),
        getBlock: vi.fn(async () => null),
        getTransactionReceipt: vi.fn(async () => null),
        send: vi.fn(async () => []),
      };
      const port = createFrontierReadOnlyObservationPort(backend);

      expect(() => port.getBlockReceipts(blockNumber)).toThrow(
        /non-negative safe integer/i,
      );
      expect(backend.send).not.toHaveBeenCalled();
    },
  );
});
