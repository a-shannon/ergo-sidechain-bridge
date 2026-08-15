/**
 * Ergo Node Client — read-only node API client
 * 
 * Handles read and check-only interactions with the Ergo testnet node:
 * - Box queries (by ID, address, token)
 * - Contract compilation
 */

import axios, { AxiosInstance } from 'axios';
import { ERGO_CONFIG } from './config.js';
import { decodeCollByteRegister } from './ergo-helpers.js';
import { validateReadOnlyNodeUrl } from './read-only-node-url.js';

export interface ErgoClientOptions {
  readOnly?: boolean;
  direct?: boolean;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
  indexedTokenPageSize?: number;
  maxIndexedTokenBoxes?: number;
  maxIndexedTokenBytes?: number;
}

export interface ErgoStorageRentParameters {
  fullHeight: number;
  parameterHeight: number;
  storageFeeFactorNanoErgPerByte: number;
}

export class ErgoClient {
  private client: AxiosInstance;
  private readonly readOnly: boolean;
  private readonly indexedTokenPageSize: number;
  private readonly maxIndexedTokenBoxes: number | null;
  private readonly maxIndexedTokenBytes: number | null;

  constructor(nodeUrl?: string, options: ErgoClientOptions = {}) {
    this.readOnly = options.readOnly === true;
    this.indexedTokenPageSize = boundedPositiveInteger(
      options.indexedTokenPageSize ?? 100,
      500,
      'indexed token page size',
    );
    this.maxIndexedTokenBoxes = options.maxIndexedTokenBoxes === undefined
      ? null
      : boundedPositiveInteger(
          options.maxIndexedTokenBoxes,
          Number.MAX_SAFE_INTEGER,
          'maximum indexed token boxes',
        );
    this.maxIndexedTokenBytes = options.maxIndexedTokenBytes === undefined
      ? null
      : boundedPositiveInteger(
          options.maxIndexedTokenBytes,
          Number.MAX_SAFE_INTEGER,
          'maximum indexed token lineage bytes',
        );
    const maxResponseBytes = options.maxResponseBytes === undefined
      ? null
      : boundedPositiveInteger(
          options.maxResponseBytes,
          Number.MAX_SAFE_INTEGER,
          'maximum Ergo node response bytes',
        );
    const requestTimeoutMs = options.requestTimeoutMs === undefined
      ? 30_000
      : boundedPositiveInteger(
          options.requestTimeoutMs,
          Number.MAX_SAFE_INTEGER,
          'Ergo node request timeout',
        );
    const baseURL = nodeUrl ?? ERGO_CONFIG.nodeUrl;
    const nodeUrlErrors = validateReadOnlyNodeUrl(baseURL, 'Ergo node URL');
    if (nodeUrlErrors.length > 0) {
      throw new Error(nodeUrlErrors.join('; '));
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (!this.readOnly) {
      headers.api_key = ERGO_CONFIG.apiKey;
    }

    this.client = axios.create({
      baseURL,
      headers,
      timeout: requestTimeoutMs,
      ...(options.direct === true ? { maxRedirects: 0, proxy: false } : {}),
      ...(maxResponseBytes === null ? {} : { maxContentLength: maxResponseBytes }),
    });
  }

  // ─── Node Info ──────────────────────────────────────────────

  async getInfo(signal?: AbortSignal): Promise<{ fullHeight: number; network: string }> {
    const { data } = await this.client.get('/info', { signal });
    return data;
  }

  async getCurrentHeight(signal?: AbortSignal): Promise<number> {
    const info = await this.getInfo(signal);
    return info.fullHeight;
  }

  async getStorageRentParameters(signal?: AbortSignal): Promise<ErgoStorageRentParameters> {
    const { data } = await this.client.get('/info', { signal });
    const fullHeight = strictNonnegativeInteger(data?.fullHeight, 'full height');
    const parameterHeight = strictNonnegativeInteger(
      data?.parameters?.height,
      'parameter activation height',
    );
    const storageFeeFactorNanoErgPerByte = strictBoundedPositiveInteger(
      data?.parameters?.storageFeeFactor,
      0x7fff_ffff,
      'storage fee factor',
    );
    if (parameterHeight > fullHeight) {
      throw new Error('parameter activation height must not exceed the full height');
    }
    return {
      fullHeight,
      parameterHeight,
      storageFeeFactorNanoErgPerByte,
    };
  }

  async getIndexedHeight(): Promise<{ indexedHeight: number; fullHeight: number }> {
    const { data } = await this.client.get('/blockchain/indexedHeight');
    return {
      indexedHeight: normalizeNodeHeight(data?.indexedHeight, 'indexed height'),
      fullHeight: normalizeNodeHeight(data?.fullHeight, 'full height'),
    };
  }

  // ─── Box Queries ────────────────────────────────────────────

  async getBoxById(boxId: string): Promise<any> {
    const { data } = await this.client.get(`/utxo/byId/${boxId}`);
    return data;
  }

  async getBoxByIdOrNull(boxId: string): Promise<any | null> {
    try {
      return await this.getBoxById(boxId);
    } catch (err: any) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  }

  /** Get box binary (for byte-level integrity — MUST use for relayer operations) */
  async getBoxByIdBinary(boxId: string): Promise<string> {
    const { data } = await this.client.get(`/utxo/byIdBinary/${boxId}`);
    return data.bytes;
  }

  async getUnspentBoxesByAddress(address: string): Promise<any[]> {
    const { data } = await this.client.post(
      '/blockchain/box/unspent/byAddress',
      `"${address}"`,
    );
    // API may return raw array or paginated {value: [...]}
    return Array.isArray(data) ? data : (data?.value ?? data?.items ?? []);
  }

  async getUnspentBoxesByAddressPage(
    address: string,
    input: Readonly<{
      offset: number;
      limit: number;
      sortDirection: 'asc' | 'desc';
    }>,
    signal?: AbortSignal,
  ): Promise<any[]> {
    if (!Number.isSafeInteger(input.offset) || input.offset < 0) {
      throw new Error('unspent-box page offset must be a nonnegative safe integer');
    }
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 500) {
      throw new Error('unspent-box page limit must be an integer between 1 and 500');
    }
    const { data } = await this.client.post(
      '/blockchain/box/unspent/byAddress',
      `"${address}"`,
      {
        params: {
          offset: input.offset,
          limit: input.limit,
          sortDirection: input.sortDirection,
          includeUnconfirmed: false,
          excludeMempoolSpent: true,
        },
        ...(signal ? { signal } : {}),
      },
    );
    let boxes: unknown;
    if (Array.isArray(data)) {
      boxes = data;
    } else if (data && typeof data === 'object' && 'value' in data) {
      boxes = data.value;
    } else if (data && typeof data === 'object' && 'items' in data) {
      boxes = data.items;
    } else {
      throw new Error('unspent-box page response must contain an array');
    }
    if (!Array.isArray(boxes)) {
      throw new Error('unspent-box page response must contain an array');
    }
    if (boxes.length > input.limit) {
      throw new Error('unspent-box page response exceeds the requested bound');
    }
    return boxes;
  }

  async addressToTree(address: string): Promise<string> {
    const { data } = await this.client.get(`/script/addressToTree/${address}`);
    return data.tree;
  }

  async getBoxesByTokenId(tokenId: string): Promise<any[]> {
    const { data } = await this.client.get(
      `/blockchain/box/unspent/byTokenId/${tokenId}`,
    );
    return data;
  }

  /** Retrieve the complete canonical extra-index lineage for a token. */
  async getIndexedBoxesByTokenId(
    tokenId: string,
    pageSize = this.indexedTokenPageSize,
  ): Promise<any[]> {
    const normalizedTokenId = normalizeIdHex(tokenId, 'token id');
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 500) {
      throw new Error('indexed token page size must be an integer between 1 and 500');
    }

    const boxes: any[] = [];
    let expectedTotal: number | null = null;
    let offset = 0;
    let accumulatedBytes = 0;
    for (;;) {
      const { data } = await this.client.get(
        `/blockchain/box/byTokenId/${normalizedTokenId}?offset=${offset}&limit=${pageSize}`,
      );
      if (!data || typeof data !== 'object' || !Array.isArray(data.items)) {
        throw new Error('indexed token response must contain an items array');
      }
      const total = Number(data.total);
      if (!Number.isSafeInteger(total) || total < 0) {
        throw new Error('indexed token response total must be a nonnegative safe integer');
      }
      if (this.maxIndexedTokenBoxes !== null && total > this.maxIndexedTokenBoxes) {
        throw new Error(
          `indexed token response total ${total} exceeds the ${this.maxIndexedTokenBoxes}-box bound`,
        );
      }
      if (expectedTotal === null) expectedTotal = total;
      if (total !== expectedTotal) {
        throw new Error(`indexed token response total changed from ${expectedTotal} to ${total}`);
      }
      if (data.items.length === 0 && boxes.length < total) {
        throw new Error(`indexed token pagination ended before total ${total}`);
      }
      if (this.maxIndexedTokenBytes !== null) {
        const pageBytes = serializedJsonBytes(data.items, 'indexed token page');
        if (pageBytes > this.maxIndexedTokenBytes - accumulatedBytes) {
          throw new Error(
            `indexed token lineage exceeds the ${this.maxIndexedTokenBytes}-byte accumulation bound`,
          );
        }
        accumulatedBytes += pageBytes;
      }
      boxes.push(...data.items);
      if (boxes.length > total) {
        throw new Error(`indexed token response returned more than total ${total}`);
      }
      if (boxes.length === total) return boxes;
      offset += data.items.length;
    }
  }

  /** Find the singleton box containing a specific NFT */
  async findSingletonBox(nftId: string): Promise<any> {
    const boxes = await this.getBoxesByTokenId(nftId);
    if (boxes.length === 0) throw new Error(`Singleton NFT ${nftId} not found in UTXO set`);
    if (boxes.length > 1) throw new Error(`Multiple boxes with NFT ${nftId} — broken invariant!`);
    return boxes[0];
  }

  // ─── Contract Compilation ───────────────────────────────────

  async compileContract(source: string, treeVersion: number = 0): Promise<{ address: string; ergoTreeHex: string }> {
    const { data } = await this.client.post('/script/p2sAddress', {
      source,
      treeVersion,
    });
    // The API returns { address: "..." }
    // We also need the ErgoTree hex — get it from addressToTree
    const address = data.address;

    try {
      const { data: treeData } = await this.client.get(
        `/utils/addressToRaw/${address}`,
      );
      // treeData can be a string or an object with 'raw' field
      const ergoTreeHex = typeof treeData === 'string' ? treeData : treeData.raw ?? treeData.hex ?? JSON.stringify(treeData);
      return { address, ergoTreeHex };
    } catch {
      // If addressToRaw fails, return address only
      return { address, ergoTreeHex: '' };
    }
  }

  // ─── Transaction Operations ─────────────────────────────────

  // signTransaction() REMOVED (2026-05-05) — used the node wallet signing endpoint
  // signAndSubmit() REMOVED (2026-05-05) — wrapper around dead method
  // walletSend() REMOVED (2026-05-05) — used the node wallet send endpoint
  // Reason: node-wallet isolation — all signing must be local and off-chain.

  // ─── Peg-In Scanning ────────────────────────────────────────

  /**
   * Scan for unspent MainChainLock boxes that have enough confirmations.
   *
   * @param lockAddress   P2S address of the MainChainLock contract
   * @param minConfirms   Minimum confirmation depth (default: 50)
   * @param currentHeight Current Ergo blockchain height
   * @returns Array of parsed peg-in candidates
   */
  async scanForPegIns(
    lockAddress: string,
    minConfirms: number,
    currentHeight: number,
  ): Promise<ParsedPegIn[]> {
    let boxes: any[];
    try {
      boxes = await this.getUnspentBoxesByAddress(lockAddress);
    } catch {
      return []; // No boxes at this address
    }

    return boxes
      .filter((box: any) => {
        const confirmations = currentHeight - box.creationHeight + 1;
        return confirmations >= minConfirms;
      })
      .map((box: any) => {
        // 🚨 CHAIN ι DEFENSE: Structural filter for sweep artifacts.
        // Consolidation sweep creates new boxes at the MCL address that lack
        // the required registers (R4=EVM addr, R5=amount, R6=signer metadata,
        // R7=depositor tree). The v3 consume path binds R4/R7 on-chain.
        // Without this flag, the sweep artifact would be detected as a new
        // deposit → sERG minted for already-counted ERG → supply inflation.
        const hasR4 = !!box.additionalRegisters?.R4;
        const hasR5 = !!box.additionalRegisters?.R5;
        const hasR6 = !!box.additionalRegisters?.R6;
        const hasR7 = !!box.additionalRegisters?.R7;
        let targetEvmAddress = '';
        let depositorErgoTreeHex = '';
        let hasValidRegisters = hasR4 && hasR5 && hasR6 && hasR7;
        if (hasValidRegisters) {
          try {
            targetEvmAddress = parseEvmAddressFromR4(box);
            depositorErgoTreeHex = parseDepositorTreeFromR7(box);
            hasValidRegisters = depositorErgoTreeHex.length > 0;
          } catch {
            hasValidRegisters = false;
          }
        }

        return {
          boxId: box.boxId,
          amountNanoErg: BigInt(box.value),
          creationHeight: box.creationHeight,
          confirmations: currentHeight - box.creationHeight + 1,
          targetEvmAddress,
          depositorErgoTreeHex,
          transactionId: box.transactionId,
          hasValidRegisters,
        };
      })
      .filter((pegIn) => {
        // 🚨 FAKE TVL GUARD: The MainChainLock box is created by the USER.
        // An attacker could set box.value = 0.001 ERG but encode R5 = 1000 ERG.
        // We ALWAYS mint based on box.value (actual ERG locked), NEVER R5.
        // This filter is an explicit guard to catch any future regression
        // where someone accidentally switches to R5 for the mint amount.
        if (pegIn.amountNanoErg <= 0n) {
          console.warn(`   ⚠️  REJECTED peg-in ${pegIn.boxId.slice(0, 16)}: zero or negative value`);
          return false;
        }
        return true;
      });
  }

  /**
   * Get the current block header hash at a given height.
   * Used for updating SideChainState R5.
   */
  async getBlockHeaderHash(height: number, signal?: AbortSignal): Promise<string> {
    const { data } = await this.client.get(`/blocks/at/${height}`, { signal });
    // Returns array of header IDs at this height
    return Array.isArray(data) ? data[0] : data;
  }

  async getBlockHeaderIdsAtHeight(height: number): Promise<string[]> {
    const { data } = await this.client.get(`/blocks/at/${height}`);
    return Array.isArray(data) ? data : [data];
  }

  async getBlockByHeaderId(headerId: string): Promise<any> {
    const { data } = await this.client.get(`/blocks/${headerId}`);
    return data;
  }

  async getBlockHeaderById(headerId: string): Promise<any | null> {
    const normalizedHeaderId = normalizeIdHex(headerId, 'header id');
    try {
      const { data } = await this.client.get(`/blocks/${normalizedHeaderId}/header`);
      return data;
    } catch (err: any) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  }

  async getBestHeader(): Promise<any> {
    const { data } = await this.client.get('/blocks/lastHeaders/1');
    if (!Array.isArray(data) || data.length !== 1) {
      throw new Error('best-header response must contain exactly one header');
    }
    return data[0];
  }

  async getExtensionFieldsAtHeight(height: number): Promise<ErgoExtensionField[]> {
    const headerIds = await this.getBlockHeaderIdsAtHeight(height);
    const fields: ErgoExtensionField[] = [];

    for (const headerId of headerIds) {
      const block = await this.getBlockByHeaderId(headerId);
      for (const field of block.extension?.fields ?? []) {
        if (Array.isArray(field) && field.length >= 2) {
          fields.push({
            key: String(field[0]).toLowerCase(),
            value: String(field[1]).toLowerCase(),
            headerId,
            height,
          });
        }
      }
    }

    return fields;
  }

  async getSidechainExtensionFieldsAtHeight(height: number): Promise<ErgoExtensionField[]> {
    return (await this.getExtensionFieldsAtHeight(height))
      .filter(field => field.key.startsWith('04'));
  }

  /**
   * Get a confirmed transaction by ID.
   * Returns null if not yet confirmed (still in mempool or unknown).
   */
  async getTransaction(txId: string): Promise<any | null> {
    try {
      const { data } = await this.client.get(`/blockchain/transaction/byId/${txId}`);
      return data;
    } catch (err: any) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  }

  async hasUnconfirmedTransaction(txId: string): Promise<boolean> {
    const normalizedTxId = txId.startsWith('0x')
      ? txId.slice(2).toLowerCase()
      : txId.toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(normalizedTxId)) {
      throw new Error(`transaction id must be 32-byte hex: ${txId}`);
    }

    const pageSize = 100;
    for (let offset = 0; ; offset += pageSize) {
      const { data } = await this.client.get(
        `/transactions/unconfirmed?limit=${pageSize}&offset=${offset}`,
      );
      const txs = Array.isArray(data) ? data : (data?.items ?? data?.value ?? []);
      for (const tx of txs) {
        const candidate = String(tx?.id ?? tx?.txId ?? '').toLowerCase();
        if (candidate === normalizedTxId) return true;
      }
      if (txs.length < pageSize) return false;
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Peg-In Data Types
// ──────────────────────────────────────────────────────────────────────────

export interface ParsedPegIn {
  boxId: string;
  amountNanoErg: bigint;
  creationHeight: number;
  confirmations: number;
  targetEvmAddress: string;
  depositorErgoTreeHex: string;
  transactionId: string;
  /** 🚨 CHAIN ι DEFENSE: false if box lacks R4/R5/R6 (sweep artifact, not real deposit) */
  hasValidRegisters: boolean;
}

export interface ErgoExtensionField {
  key: string;
  value: string;
  headerId: string;
  height: number;
}

/**
 * Parse the EVM destination address from a MainChainLock box R4.
 *
 * R4 contains a Sigma-serialized Coll[Byte] with the 20-byte EVM address.
 * Sigma encoding: 0e + length_byte + hex_bytes
 *   e.g., R4 = "0e14" + "f24ff3a9cf04c71dbc94d0b566f7a27b94566cac"
 *         0e = Coll[Byte] type tag
 *         14 = 20 decimal = 0x14 bytes
 *         rest = raw EVM address
 *
 * Deep Think note: strip the Sigma prefix (first 4 chars "0e14") and
 * prepend "0x" for ethers.js compatibility.
 */
function parseEvmAddressFromR4(box: any): string {
  const r4 = box.additionalRegisters?.R4?.serializedValue
           ?? box.additionalRegisters?.R4;

  if (!r4 || typeof r4 !== 'string') {
    throw new Error('peg-in R4 is missing');
  }
  const addressHex = decodeCollByteRegister(r4, 'peg-in R4');
  if (addressHex.length !== 40) throw new Error('peg-in R4 must contain a 20-byte H160');
  return `0x${addressHex}`;
}

function normalizeIdHex(value: string, label: string): string {
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-f]{64}$/i.test(clean)) {
    throw new Error(`${label} must be 32-byte hex`);
  }
  return clean.toLowerCase();
}

function normalizeNodeHeight(value: unknown, label: string): number {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return normalized;
}

function strictNonnegativeInteger(value: unknown, label: string): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 0
  ) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

function strictBoundedPositiveInteger(
  value: unknown,
  max: number,
  label: string,
): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 1
    || value > max
  ) {
    throw new Error(`${label} must be an integer between 1 and ${max}`);
  }
  return value;
}

function boundedPositiveInteger(value: unknown, max: number, label: string): number {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > max) {
    throw new Error(`${label} must be an integer between 1 and ${max}`);
  }
  return normalized;
}

function serializedJsonBytes(value: unknown, label: string): number {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('not JSON serializable');
    return Buffer.byteLength(serialized, 'utf8');
  } catch {
    throw new Error(`${label} must be finite JSON data`);
  }
}

function parseDepositorTreeFromR7(box: any): string {
  const r7 = box.additionalRegisters?.R7?.serializedValue
           ?? box.additionalRegisters?.R7;
  if (!r7 || typeof r7 !== 'string') throw new Error('peg-in R7 is missing');
  return decodeCollByteRegister(r7, 'peg-in R7');
}
