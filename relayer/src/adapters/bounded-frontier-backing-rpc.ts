import { Interface, getAddress, id, keccak256 } from 'ethers';

import type {
  FrontierBackingBlock,
  FrontierBackingPegOutLike,
  FrontierBackingReadClient,
  FrontierBackingRuntimeIdentity,
} from './frontier-backing-read-agreement.js';

const PEG_OUT_INTERFACE = new Interface([
  'event PegOut(address indexed user, uint256 amount, bytes ergoRecipientPubKey)',
  'function totalSERGSupply() view returns (uint256)',
  'function sergToken() view returns (address)',
  'function owner() view returns (address)',
]);
const PEG_OUT_TOPIC = id('PegOut(address,uint256,bytes)').toLowerCase();
const TOTAL_SUPPLY_CALL_DATA = PEG_OUT_INTERFACE.encodeFunctionData(
  'totalSERGSupply',
);
const SERG_ADDRESS_CALL_DATA = PEG_OUT_INTERFACE.encodeFunctionData('sergToken');
const OWNER_CALL_DATA = PEG_OUT_INTERFACE.encodeFunctionData('owner');
const MAX_LOGS_PER_PAGE = 4_096;

export const MAX_FRONTIER_BACKING_RPC_RESPONSE_BYTES = 8 * 1024 * 1024;
export const FRONTIER_BACKING_RPC_TIMEOUT_MS = 10_000;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface BoundedFrontierBackingRpcOptions {
  readonly maxResponseBytes?: number;
  readonly timeoutMs?: number;
  readonly fetchImpl?: FetchLike;
}

export function createBoundedFrontierBackingReadClient(
  endpoint: string,
  bridgeAddress: string,
  options: BoundedFrontierBackingRpcOptions = {},
): FrontierBackingReadClient {
  const rpcEndpoint = canonicalEndpoint(endpoint);
  const canonicalBridgeAddress = canonicalAddress(bridgeAddress);
  const maxResponseBytes = positiveSafeInteger(
    options.maxResponseBytes ?? MAX_FRONTIER_BACKING_RPC_RESPONSE_BYTES,
    'Frontier backing RPC response byte limit',
  );
  const timeoutMs = positiveSafeInteger(
    options.timeoutMs ?? FRONTIER_BACKING_RPC_TIMEOUT_MS,
    'Frontier backing RPC timeout',
  );
  const fetchImpl = options.fetchImpl ?? fetch;
  let nextRequestId = 1;

  async function request(
    method: string,
    params: readonly unknown[],
  ): Promise<unknown> {
    const requestId = nextRequestId;
    nextRequestId = requestId === Number.MAX_SAFE_INTEGER ? 1 : requestId + 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref();
    try {
      const response = await fetchImpl(rpcEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }),
        redirect: 'error',
        signal: controller.signal,
      });
      const declaredLength = response.headers.get('content-length');
      if (declaredLength !== null) {
        const parsedLength = Number(declaredLength);
        if (
          Number.isSafeInteger(parsedLength)
          && parsedLength > maxResponseBytes
        ) {
          await response.body?.cancel().catch(() => undefined);
          controller.abort();
          throw new Error(
            `Frontier backing RPC response exceeds ${maxResponseBytes} bytes`,
          );
        }
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        controller.abort();
        throw new Error(
          `Frontier backing RPC request failed with HTTP status ${response.status}`,
        );
      }
      if (!response.body) {
        throw new Error('Frontier backing RPC response body is missing');
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxResponseBytes) {
          await reader.cancel().catch(() => undefined);
          controller.abort();
          throw new Error(
            `Frontier backing RPC response exceeds ${maxResponseBytes} bytes`,
          );
        }
        chunks.push(value);
      }

      let payload: unknown;
      try {
        payload = JSON.parse(
          Buffer.concat(
            chunks.map(chunk => Buffer.from(chunk)),
            totalBytes,
          ).toString('utf8'),
        );
      } catch {
        throw new Error('Frontier backing RPC response is not valid JSON');
      }
      const rpc = record(payload, 'Frontier backing RPC response');
      if (rpc.jsonrpc !== '2.0' || rpc.id !== requestId) {
        throw new Error(
          'Frontier backing RPC response identity does not match the request',
        );
      }
      if (rpc.error !== undefined) {
        const error = rpc.error;
        const code = error && typeof error === 'object' && !Array.isArray(error)
          ? (error as Record<string, unknown>).code
          : undefined;
        throw new Error(
          typeof code === 'number' && Number.isSafeInteger(code)
            ? `Frontier backing RPC returned error code ${String(code)}`
            : 'Frontier backing RPC returned an error',
        );
      }
      if (!Object.prototype.hasOwnProperty.call(rpc, 'result')) {
        throw new Error('Frontier backing RPC response is missing its result');
      }
      return rpc.result;
    } finally {
      clearTimeout(timeout);
    }
  }

  return Object.freeze({
    async getCurrentBlockNumber(): Promise<number> {
      return rpcQuantity(
        await request('eth_blockNumber', []),
        'Frontier backing tip',
      );
    },

    async getBlock(blockNumber: number): Promise<FrontierBackingBlock | null> {
      const height = nonnegativeSafeInteger(
        blockNumber,
        'Frontier backing block height',
      );
      const value = await request('eth_getBlockByNumber', [
        rpcQuantityHex(height),
        false,
      ]);
      if (value === null) return null;
      const block = record(value, 'Frontier backing block');
      return Object.freeze({
        number: rpcQuantity(block.number, 'Frontier backing block number'),
        hash: fixedHex32WithPrefix(
          block.hash,
          'Frontier backing block hash',
        ),
      });
    },

    async scanForPegOuts(
      fromBlock: number,
      toBlock: number,
    ): Promise<readonly FrontierBackingPegOutLike[]> {
      const from = nonnegativeSafeInteger(
        fromBlock,
        'Frontier backing scan start',
      );
      const to = nonnegativeSafeInteger(
        toBlock,
        'Frontier backing scan end',
      );
      if (to < from) {
        throw new Error('Frontier backing scan range is inverted');
      }
      const value = await request('eth_getLogs', [{
        address: canonicalBridgeAddress,
        topics: [PEG_OUT_TOPIC],
        fromBlock: rpcQuantityHex(from),
        toBlock: rpcQuantityHex(to),
      }]);
      if (!Array.isArray(value) || value.length > MAX_LOGS_PER_PAGE) {
        throw new Error('Frontier backing log page exceeds its bound');
      }
      return Object.freeze(value.map((item, index) =>
        parsePegOutLog(item, canonicalBridgeAddress, index),
      ));
    },

    async getTransactionReceipt(transactionHash: string): Promise<unknown> {
      return request('eth_getTransactionReceipt', [
        fixedHex32WithPrefix(
          transactionHash,
          'Frontier backing receipt transaction hash',
        ),
      ]);
    },

    async getTotalSERGSupplyAtBlockHash(blockHashHex: string): Promise<bigint> {
      const blockHash = fixedHex32WithPrefix(
        blockHashHex,
        'Frontier backing supply block hash',
      );
      const value = await request('eth_call', [
        {
          to: canonicalBridgeAddress,
          data: TOTAL_SUPPLY_CALL_DATA,
        },
        {
          blockHash,
          requireCanonical: true,
        },
      ]);
      if (typeof value !== 'string') {
        throw new Error('Frontier backing supply result must be hex');
      }
      try {
        const decoded = PEG_OUT_INTERFACE.decodeFunctionResult(
          'totalSERGSupply',
          value,
        );
        return BigInt(decoded[0]);
      } catch {
        throw new Error('Frontier backing supply result is invalid');
      }
    },

    async getRuntimeIdentityAtBlockHash(
      blockHashHex: string,
    ): Promise<Readonly<FrontierBackingRuntimeIdentity>> {
      const blockHash = fixedHex32WithPrefix(
        blockHashHex,
        'Frontier backing runtime identity block hash',
      );
      const blockSelector = {
        blockHash,
        requireCanonical: true,
      } as const;
      const chainId = rpcQuantityBigInt(
        await request('eth_chainId', []),
        'Frontier backing chain ID',
      ).toString();
      const bridgeCode = runtimeCode(
        await request('eth_getCode', [canonicalBridgeAddress, blockSelector]),
        'Frontier backing bridge runtime code',
      );
      const sergAddress = decodeAddressResult(
        'sergToken',
        await request('eth_call', [{
          to: canonicalBridgeAddress,
          data: SERG_ADDRESS_CALL_DATA,
        }, blockSelector]),
      );
      const sergCode = runtimeCode(
        await request('eth_getCode', [sergAddress, blockSelector]),
        'Frontier backing sERG runtime code',
      );
      const sergOwnerAddress = decodeAddressResult(
        'owner',
        await request('eth_call', [{
          to: sergAddress,
          data: OWNER_CALL_DATA,
        }, blockSelector]),
        true,
      );
      return Object.freeze({
        chainId,
        bridgeCodeHashHex: keccak256(bridgeCode).slice(2).toLowerCase(),
        sergAddress,
        sergCodeHashHex: keccak256(sergCode).slice(2).toLowerCase(),
        sergOwnerAddress,
      });
    },
  });
}

function parsePegOutLog(
  value: unknown,
  bridgeAddress: string,
  index: number,
): FrontierBackingPegOutLike {
  const log = record(value, `Frontier backing log ${index}`);
  if (canonicalAddress(log.address) !== bridgeAddress) {
    throw new Error('Frontier backing log address changed');
  }
  if (log.removed === true) {
    throw new Error('Frontier backing log is marked removed');
  }
  if (!Array.isArray(log.topics) || log.topics.some(topic =>
    typeof topic !== 'string'
  )) {
    throw new Error('Frontier backing log topics are invalid');
  }
  let parsed;
  try {
    parsed = PEG_OUT_INTERFACE.parseLog({
      topics: log.topics as string[],
      data: typeof log.data === 'string' ? log.data : '',
    });
  } catch {
    throw new Error('Frontier backing log does not encode PegOut');
  }
  if (!parsed || parsed.name !== 'PegOut') {
    throw new Error('Frontier backing log has an unsupported event');
  }
  return Object.freeze({
    user: String(parsed.args[0]),
    amount: BigInt(parsed.args[1]),
    ergoRecipientAddress: String(parsed.args[2]),
    sidechainTxHash: fixedHex32WithPrefix(
      log.transactionHash,
      'Frontier backing log transaction hash',
    ),
    sidechainBlockNumber: rpcQuantity(
      log.blockNumber,
      'Frontier backing log block number',
    ),
    sidechainBlockHash: fixedHex32WithPrefix(
      log.blockHash,
      'Frontier backing log block hash',
    ),
    sidechainLogIndex: rpcQuantity(
      log.logIndex ?? log.index,
      'Frontier backing log index',
    ),
  });
}

function canonicalEndpoint(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Frontier backing RPC endpoint must be an absolute URL');
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
  ) {
    throw new Error(
      'Frontier backing RPC endpoint must be HTTP(S) without credentials',
    );
  }
  return parsed.toString();
}

function canonicalAddress(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Frontier backing bridge address must be an EVM address');
  }
  let address: string;
  try {
    address = getAddress(value).toLowerCase();
  } catch {
    throw new Error('Frontier backing bridge address must be an EVM address');
  }
  if (address === `0x${'00'.repeat(20)}`) {
    throw new Error('Frontier backing bridge address must not be zero');
  }
  return address;
}

function fixedHex32WithPrefix(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error(`${label} must be 32 bytes of hex`);
  }
  return `0x${clean}`;
}

function rpcQuantity(value: unknown, label: string): number {
  const parsed = Number(rpcQuantityBigInt(value, label));
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} exceeds the safe range`);
  }
  return parsed;
}

function rpcQuantityBigInt(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) {
    throw new Error(`${label} must be a canonical RPC quantity`);
  }
  return BigInt(value);
}

function rpcQuantityHex(value: number): string {
  return `0x${nonnegativeSafeInteger(value, 'RPC quantity').toString(16)}`;
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function positiveSafeInteger(value: unknown, label: string): number {
  const number = nonnegativeSafeInteger(value, label);
  if (number === 0) throw new Error(`${label} must be positive`);
  return number;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function runtimeCode(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^0x(?:[0-9a-f]{2})+$/iu.test(value)
  ) {
    throw new Error(`${label} must be nonempty byte-aligned hex`);
  }
  return value.toLowerCase();
}

function decodeAddressResult(
  functionName: 'sergToken' | 'owner',
  value: unknown,
  allowZero = false,
): string {
  if (typeof value !== 'string') {
    throw new Error(`Frontier backing ${functionName} result must be hex`);
  }
  let address: string;
  try {
    address = getAddress(
      PEG_OUT_INTERFACE.decodeFunctionResult(functionName, value)[0],
    ).toLowerCase();
  } catch {
    throw new Error(`Frontier backing ${functionName} result is invalid`);
  }
  if (!allowZero && address === `0x${'00'.repeat(20)}`) {
    throw new Error(`Frontier backing ${functionName} result must not be zero`);
  }
  return address;
}
