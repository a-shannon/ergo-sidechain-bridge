import { Interface, keccak256 } from 'ethers';
import { describe, expect, it } from 'vitest';

import {
  createBoundedFrontierBackingReadClient,
} from './bounded-frontier-backing-rpc.js';

const BRIDGE = `0x${'11'.repeat(20)}`;
const USER = `0x${'22'.repeat(20)}`;
const SERG = `0x${'23'.repeat(20)}`;
const SERG_OWNER = `0x${'24'.repeat(20)}`;
const TRANSACTION_HASH = `0x${'33'.repeat(32)}`;
const BLOCK_HASH = `0x${'44'.repeat(32)}`;
const RECIPIENT = `0x02${'55'.repeat(32)}`;
const HEIGHT = 2_001;
const AMOUNT = 25_000_000n;
const SUPPLY = 5_000_000_000n;
const BRIDGE_CODE = '0x6001600055';
const SERG_CODE = '0x6002600055';
const CHAIN_ID = 31_337n;
const ABI = new Interface([
  'event PegOut(address indexed user, uint256 amount, bytes ergoRecipientPubKey)',
  'function totalSERGSupply() view returns (uint256)',
  'function sergToken() view returns (address)',
  'function owner() view returns (address)',
]);

interface CapturedRequest {
  readonly method: string;
  readonly params: readonly unknown[];
}

function jsonResponse(id: number, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function rpcFixture(): Readonly<{
  requests: CapturedRequest[];
  fetchImpl: typeof fetch;
}> {
  const event = ABI.encodeEventLog(ABI.getEvent('PegOut')!, [
    USER,
    AMOUNT,
    RECIPIENT,
  ]);
  const log = {
    address: BRIDGE,
    topics: event.topics,
    data: event.data,
    transactionHash: TRANSACTION_HASH,
    blockNumber: `0x${HEIGHT.toString(16)}`,
    blockHash: BLOCK_HASH,
    logIndex: '0x7',
    removed: false,
  };
  const receipt = {
    status: '0x1',
    transactionHash: TRANSACTION_HASH,
    blockNumber: `0x${HEIGHT.toString(16)}`,
    blockHash: BLOCK_HASH,
    logs: [log],
  };
  const requests: CapturedRequest[] = [];
  const fetchImpl = async (
    _input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = JSON.parse(String(init?.body)) as {
      id: number;
      method: string;
      params: readonly unknown[];
    };
    requests.push({ method: request.method, params: request.params });
    switch (request.method) {
      case 'eth_blockNumber':
        return jsonResponse(request.id, `0x${HEIGHT.toString(16)}`);
      case 'eth_getBlockByNumber':
        return jsonResponse(request.id, {
          number: `0x${HEIGHT.toString(16)}`,
          hash: BLOCK_HASH,
        });
      case 'eth_getLogs':
        return jsonResponse(request.id, [log]);
      case 'eth_getTransactionReceipt':
        return jsonResponse(request.id, receipt);
      case 'eth_chainId':
        return jsonResponse(request.id, `0x${CHAIN_ID.toString(16)}`);
      case 'eth_getCode':
        return jsonResponse(
          request.id,
          request.params[0] === BRIDGE ? BRIDGE_CODE : SERG_CODE,
        );
      case 'eth_call': {
        const call = request.params[0] as { data?: string };
        if (call.data === ABI.encodeFunctionData('sergToken')) {
          return jsonResponse(
            request.id,
            ABI.encodeFunctionResult('sergToken', [SERG]),
          );
        }
        if (call.data === ABI.encodeFunctionData('owner')) {
          return jsonResponse(
            request.id,
            ABI.encodeFunctionResult('owner', [SERG_OWNER]),
          );
        }
        return jsonResponse(
          request.id,
          ABI.encodeFunctionResult('totalSERGSupply', [SUPPLY]),
        );
      }
      default:
        throw new Error(`unexpected RPC method ${request.method}`);
    }
  };
  return { requests, fetchImpl: fetchImpl as typeof fetch };
}

describe('bounded Frontier backing RPC', () => {
  it('exposes only bounded read operations and hash-addresses supply', async () => {
    const fixture = rpcFixture();
    const client = createBoundedFrontierBackingReadClient(
      'http://127.0.0.1:9945',
      BRIDGE,
      { fetchImpl: fixture.fetchImpl },
    );

    await expect(client.getCurrentBlockNumber()).resolves.toBe(HEIGHT);
    await expect(client.getBlock(HEIGHT)).resolves.toEqual({
      number: HEIGHT,
      hash: BLOCK_HASH,
    });
    await expect(client.scanForPegOuts(2_000, HEIGHT)).resolves.toEqual([{
      user: USER,
      amount: AMOUNT,
      ergoRecipientAddress: RECIPIENT,
      sidechainTxHash: TRANSACTION_HASH,
      sidechainBlockNumber: HEIGHT,
      sidechainBlockHash: BLOCK_HASH,
      sidechainLogIndex: 7,
    }]);
    await expect(
      client.getTransactionReceipt(TRANSACTION_HASH),
    ).resolves.toMatchObject({ transactionHash: TRANSACTION_HASH });
    await expect(
      client.getTotalSERGSupplyAtBlockHash(BLOCK_HASH),
    ).resolves.toBe(SUPPLY);
    await expect(
      client.getRuntimeIdentityAtBlockHash(BLOCK_HASH),
    ).resolves.toEqual({
      chainId: CHAIN_ID.toString(),
      bridgeCodeHashHex: keccak256(BRIDGE_CODE).slice(2),
      sergAddress: SERG,
      sergCodeHashHex: keccak256(SERG_CODE).slice(2),
      sergOwnerAddress: SERG_OWNER,
    });

    expect(fixture.requests.map(request => request.method)).toEqual([
      'eth_blockNumber',
      'eth_getBlockByNumber',
      'eth_getLogs',
      'eth_getTransactionReceipt',
      'eth_call',
      'eth_chainId',
      'eth_getCode',
      'eth_call',
      'eth_getCode',
      'eth_call',
    ]);
    expect(fixture.requests[2].params).toEqual([{
      address: BRIDGE,
      topics: [ABI.getEvent('PegOut')!.topicHash],
      fromBlock: '0x7d0',
      toBlock: '0x7d1',
    }]);
    expect(fixture.requests[4].params).toEqual([
      {
        to: BRIDGE,
        data: ABI.encodeFunctionData('totalSERGSupply'),
      },
      {
        blockHash: BLOCK_HASH,
        requireCanonical: true,
      },
    ]);
    const blockSelector = {
      blockHash: BLOCK_HASH,
      requireCanonical: true,
    };
    expect(fixture.requests[6].params).toEqual([BRIDGE, blockSelector]);
    expect(fixture.requests[7].params).toEqual([{
      to: BRIDGE,
      data: ABI.encodeFunctionData('sergToken'),
    }, blockSelector]);
    expect(fixture.requests[8].params).toEqual([SERG, blockSelector]);
    expect(fixture.requests[9].params).toEqual([{
      to: SERG,
      data: ABI.encodeFunctionData('owner'),
    }, blockSelector]);
  });

  it('rejects oversized streamed responses before JSON parsing', async () => {
    const client = createBoundedFrontierBackingReadClient(
      'http://127.0.0.1:9945',
      BRIDGE,
      {
        maxResponseBytes: 32,
        fetchImpl: (async () => new Response('x'.repeat(64), {
          status: 200,
        })) as typeof fetch,
      },
    );

    await expect(client.getCurrentBlockNumber()).rejects.toThrow(
      /response exceeds 32 bytes/i,
    );
  });

  it('aborts a stalled request and rejects credential-bearing endpoints', async () => {
    const stalledFetch = ((
      _input: string | URL | Request,
      init?: RequestInit,
    ) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new Error('request aborted'));
      });
    })) as typeof fetch;
    const client = createBoundedFrontierBackingReadClient(
      'http://127.0.0.1:9945',
      BRIDGE,
      { timeoutMs: 5, fetchImpl: stalledFetch },
    );

    await expect(client.getCurrentBlockNumber()).rejects.toThrow(/aborted/i);
    expect(() => createBoundedFrontierBackingReadClient(
      'http://user:password@127.0.0.1:9945',
      BRIDGE,
    )).toThrow(/without credentials/i);
  });
});
