import { once } from 'events';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import type { AddressInfo } from 'net';

import type { StableSidechainSource } from './authenticated-settlement-sidechain-view.js';

interface JsonRpcRequest {
  readonly jsonrpc?: string;
  readonly id?: unknown;
  readonly method?: unknown;
  readonly params?: unknown;
}

export interface StableSidechainJsonRpcFixture {
  readonly rpcUrl: string;
  close(): Promise<void>;
}

export async function startStableSidechainJsonRpcFixture(
  source: StableSidechainSource,
): Promise<StableSidechainJsonRpcFixture> {
  const server = createServer((request, response) => {
    void handleRequest(source, request, response);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return Object.freeze({
    rpcUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      server.closeAllConnections?.();
      server.close();
      await once(server, 'close');
    },
  });
}

async function handleRequest(
  source: StableSidechainSource,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = await readBody(request);
    const parsed = JSON.parse(body) as JsonRpcRequest | JsonRpcRequest[];
    const result = Array.isArray(parsed)
      ? await Promise.all(parsed.map(item => respondTo(source, item)))
      : await respondTo(source, parsed);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(500, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
    }));
  }
}

async function respondTo(source: StableSidechainSource, request: JsonRpcRequest) {
  const method = typeof request.method === 'string' ? request.method : '';
  const params = Array.isArray(request.params) ? request.params : [];
  let result: unknown;
  switch (method) {
    case 'eth_chainId':
      result = '0x539';
      break;
    case 'net_version':
      result = '1337';
      break;
    case 'eth_blockNumber':
      result = quantity(await source.getBlockNumber());
      break;
    case 'eth_getTransactionReceipt': {
      const receipt = await source.getTransactionReceipt(String(params[0] ?? ''));
      result = receipt === null ? null : jsonRpcReceipt(receipt);
      break;
    }
    case 'eth_getBlockByNumber': {
      const blockNumber = Number(BigInt(String(params[0])));
      const block = await source.getBlock(blockNumber);
      result = block === null ? null : jsonRpcBlock(blockNumber, block.hash ?? null);
      break;
    }
    default:
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: { code: -32601, message: `unsupported test JSON-RPC method ${method}` },
      };
  }
  return { jsonrpc: '2.0', id: request.id ?? null, result };
}

function jsonRpcReceipt(value: unknown): Record<string, unknown> {
  const raw = record(value, 'test transaction receipt');
  const transactionHash = stringValue(
    raw.hash ?? raw.transactionHash,
    'test transaction receipt hash',
  );
  const blockHash = stringValue(raw.blockHash, 'test transaction receipt block hash');
  const blockNumber = numberValue(raw.blockNumber, 'test transaction receipt block number');
  const logs = Array.isArray(raw.logs) ? raw.logs : [];
  return {
    blockHash,
    blockNumber: quantity(blockNumber),
    contractAddress: null,
    cumulativeGasUsed: '0x5208',
    effectiveGasPrice: '0x1',
    from: `0x${'11'.repeat(20)}`,
    gasUsed: '0x5208',
    logs: logs.map((entry, index) => jsonRpcLog(entry, index)),
    logsBloom: `0x${'00'.repeat(256)}`,
    status: quantity(numberValue(raw.status ?? 1, 'test transaction receipt status')),
    to: logs.length > 0
      ? stringValue(record(logs[0], 'test transaction receipt first log').address, 'test log address')
      : `0x${'22'.repeat(20)}`,
    transactionHash,
    transactionIndex: '0x0',
    type: '0x0',
  };
}

function jsonRpcLog(value: unknown, fallbackIndex: number): Record<string, unknown> {
  const raw = record(value, `test transaction receipt log ${fallbackIndex}`);
  const blockNumber = numberValue(raw.blockNumber, 'test log block number');
  const logIndex = numberValue(raw.logIndex ?? raw.index ?? fallbackIndex, 'test log index');
  return {
    address: stringValue(raw.address, 'test log address'),
    blockHash: stringValue(raw.blockHash, 'test log block hash'),
    blockNumber: quantity(blockNumber),
    data: stringValue(raw.data, 'test log data'),
    logIndex: quantity(logIndex),
    removed: false,
    topics: Array.isArray(raw.topics) ? raw.topics : [],
    transactionHash: stringValue(raw.transactionHash, 'test log transaction hash'),
    transactionIndex: '0x0',
  };
}

function jsonRpcBlock(blockNumber: number, hash: string | null): Record<string, unknown> {
  return {
    baseFeePerGas: '0x1',
    difficulty: '0x0',
    extraData: '0x',
    gasLimit: '0x1c9c380',
    gasUsed: '0x0',
    hash,
    logsBloom: `0x${'00'.repeat(256)}`,
    miner: `0x${'00'.repeat(20)}`,
    nonce: '0x0000000000000000',
    number: quantity(blockNumber),
    parentHash: `0x${'aa'.repeat(32)}`,
    receiptsRoot: `0x${'bb'.repeat(32)}`,
    sha3Uncles: `0x${'cc'.repeat(32)}`,
    stateRoot: `0x${'dd'.repeat(32)}`,
    timestamp: '0x1',
    totalDifficulty: '0x0',
    transactions: [],
    transactionsRoot: `0x${'ee'.repeat(32)}`,
    uncles: [],
  };
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function quantity(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('test JSON-RPC quantity must be a nonnegative safe integer');
  }
  return `0x${value.toString(16)}`;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  return value;
}

function numberValue(value: unknown, label: string): number {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return normalized;
}
