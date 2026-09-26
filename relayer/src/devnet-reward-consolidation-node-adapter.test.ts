import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import {
  assertExactNodeIdentity,
  observeRewardConsolidationTransaction,
} from './scripts/devnet-consolidate-rewards.js';

const TX_ID = '11'.repeat(32);
const CHAIN_ANCHOR = '22'.repeat(32);
const INCLUSION_HEADER = '33'.repeat(32);
const NODE_ORIGIN = 'http://127.0.0.1:9051';

function client(overrides: Readonly<{
  network?: string;
  chainAnchor?: string;
  inclusionHeader?: string;
  confirmations?: unknown;
  inclusionHeight?: unknown;
}> = {}): Readonly<{
  client: AxiosInstance;
  get: ReturnType<typeof vi.fn>;
}> {
  const get = vi.fn(async (path: string) => {
    if (path === '/info') {
      return { data: { fullHeight: 20, network: overrides.network ?? 'devnet' } };
    }
    if (path === '/blocks/at/1') {
      return { data: [overrides.chainAnchor ?? CHAIN_ANCHOR] };
    }
    if (path === `/blockchain/transaction/byId/${TX_ID}`) {
      return { data: {
        id: TX_ID,
        numConfirmations: overrides.confirmations ?? 10,
        inclusionHeight: overrides.inclusionHeight ?? 10,
        headerId: INCLUSION_HEADER,
      } };
    }
    if (path === '/blocks/at/10') {
      return { data: [overrides.inclusionHeader ?? INCLUSION_HEADER] };
    }
    throw new Error(`unexpected adapter path: ${path}`);
  });
  return {
    client: {
      defaults: { baseURL: NODE_ORIGIN },
      get,
    } as unknown as AxiosInstance,
    get,
  };
}

describe('devnet reward consolidation node adapter', () => {
  it('binds one client to the exact session anchor and canonical inclusion header', async () => {
    const fixture = client();
    await expect(assertExactNodeIdentity(
      fixture.client,
      CHAIN_ANCHOR,
    )).resolves.toMatchObject({
      network: 'devnet',
      chainAnchorHeaderIdHex: CHAIN_ANCHOR,
    });
    await expect(observeRewardConsolidationTransaction(
      fixture.client,
      TX_ID,
      NODE_ORIGIN,
      CHAIN_ANCHOR,
    )).resolves.toMatchObject({
      status: 'confirmed',
      confirmations: 10,
      confirmationHeight: 10,
      confirmationHeaderIdHex: INCLUSION_HEADER,
    });
    expect(fixture.get.mock.calls.map(call => call[0])).toEqual([
      '/info',
      '/blocks/at/1',
      '/info',
      '/blocks/at/1',
      `/blockchain/transaction/byId/${TX_ID}`,
      '/blocks/at/10',
    ]);
  });

  it.each([
    ['testnet identity', { network: 'testnet' }, /devnet identity/i],
    ['wrong chain anchor', { chainAnchor: '44'.repeat(32) }, /session identity/i],
    ['replaced inclusion header', { inclusionHeader: '55'.repeat(32) }, /not in the canonical header/i],
  ])('rejects %s', async (_name, overrides, expected) => {
    const fixture = client(overrides);
    await expect(observeRewardConsolidationTransaction(
      fixture.client,
      TX_ID,
      NODE_ORIGIN,
      CHAIN_ANCHOR,
    )).rejects.toThrow(expected);
  });

  it('rejects a client whose configured origin differs from the bound origin', async () => {
    const fixture = client();
    fixture.client.defaults.baseURL = 'http://127.0.0.1:9999';
    await expect(observeRewardConsolidationTransaction(
      fixture.client,
      TX_ID,
      NODE_ORIGIN,
      CHAIN_ANCHOR,
    )).rejects.toThrow(/client does not match/i);
    expect(fixture.get).not.toHaveBeenCalled();
  });

  it('keeps a shallow inclusion nonterminal', async () => {
    const fixture = client({ confirmations: 1 });
    await expect(observeRewardConsolidationTransaction(
      fixture.client,
      TX_ID,
      NODE_ORIGIN,
      CHAIN_ANCHOR,
    )).resolves.toMatchObject({
      status: 'pending',
      confirmations: 1,
      confirmationHeight: null,
      confirmationHeaderIdHex: null,
    });
    expect(fixture.get).not.toHaveBeenCalledWith('/blocks/at/10');
  });

  it.each([
    ['string confirmation count', { confirmations: '10' }, /confirmation count/i],
    ['boolean confirmation count', { confirmations: true }, /confirmation count/i],
    ['string inclusion height', { inclusionHeight: '11' }, /inclusion height/i],
  ])('rejects a %s', async (_name, overrides, expected) => {
    const fixture = client(overrides);
    await expect(observeRewardConsolidationTransaction(
      fixture.client,
      TX_ID,
      NODE_ORIGIN,
      CHAIN_ANCHOR,
    )).rejects.toThrow(expected);
  });

  it('rejects an inclusion-inclusive confirmation count', async () => {
    const fixture = client({ confirmations: 10, inclusionHeight: 11 });
    await expect(observeRewardConsolidationTransaction(
      fixture.client,
      TX_ID,
      NODE_ORIGIN,
      CHAIN_ANCHOR,
    )).rejects.toThrow(/confirmation depth is inconsistent/i);
    expect(fixture.get).not.toHaveBeenCalledWith('/blocks/at/11');
  });
});
