import { ErgoBoxJson, MinimalHeaderJson } from '../crypto/signer.js';

export interface ErgoNodeInfo {
  fullHeight: number;
  headersHeight: number;
  network?: string;
  stateType?: string;
  name?: string;
}

export interface ErgoIndexedBox extends ErgoBoxJson {
  inclusionHeight: number;
  spentTransactionId: string | null;
  globalIndex?: number;
}

export interface ErgoIndexedTx {
  id: string;
  inclusionHeight: number;
  inputs: Array<{
    boxId: string;
    spendingProof: {
      proofBytes: string;
      extension: Record<string, string>;
    };
  }>;
  dataInputs: Array<{ boxId: string }>;
  outputs: ErgoIndexedBox[];
}

export class StockErgoNodeClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(opts: { baseUrl: string; apiKey?: string; timeoutMs?: number }) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: unknown,
    rawTextBody?: string,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (this.apiKey) headers['api_key'] = this.apiKey;
      let payload: string | undefined;
      if (rawTextBody !== undefined) {
        headers['Content-Type'] = 'text/plain';
        payload = rawTextBody;
      } else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
      }
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers,
        body: payload,
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Ergo node ${method} ${endpoint} failed (${res.status}): ${text}`);
      }
      if (!text) return undefined as T;
      try {
        // Preserve large integer box values / token amounts (> 2^53) as exact strings ([M-1])
        return JSON.parse(text, (key, value, context?: { source?: string }) => {
          if ((key === 'value' || key === 'amount') && typeof value === 'number' && context?.source) {
            return context.source;
          }
          return value;
        }) as T;
      } catch {
        return text as unknown as T;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async getInfo(): Promise<ErgoNodeInfo> {
    return this.request<ErgoNodeInfo>('GET', '/info');
  }

  async getIndexedHeight(): Promise<{ indexedHeight: number; fullHeight: number }> {
    return this.request<{ indexedHeight: number; fullHeight: number }>(
      'GET',
      '/blockchain/indexedHeight',
    );
  }

  async getLastHeaders(count = 10): Promise<MinimalHeaderJson[]> {
    return this.request<MinimalHeaderJson[]>('GET', `/blocks/lastHeaders/${count}`);
  }

  async getHeaderIdsAtHeight(height: number): Promise<string[]> {
    return this.request<string[]>('GET', `/blocks/at/${height}`);
  }

  async getBoxById(boxId: string): Promise<ErgoIndexedBox> {
    return this.request<ErgoIndexedBox>('GET', `/blockchain/box/byId/${boxId}`);
  }

  async getUnspentBoxById(boxId: string): Promise<ErgoBoxJson | null> {
    try {
      return await this.request<ErgoBoxJson>('GET', `/utxo/byId/${boxId}`);
    } catch {
      return null;
    }
  }

  /**
   * Check whether `boxId` is still unspent AFTER accounting for unconfirmed
   * mempool transactions (`/utxo/withPool/byId/{boxId}`). Returns null if
   * already spent on-chain OR by a pending mempool transaction ([H-3]).
   */
  async getUnspentBoxWithPool(boxId: string): Promise<ErgoBoxJson | null> {
    try {
      return await this.request<ErgoBoxJson>('GET', `/utxo/withPool/byId/${boxId}`);
    } catch {
      return null;
    }
  }

  async getTransactionById(txId: string): Promise<ErgoIndexedTx> {
    return this.request<ErgoIndexedTx>('GET', `/blockchain/transaction/byId/${txId}`);
  }

  async getUnspentBoxesByAddress(address: string, limit = 100): Promise<ErgoIndexedBox[]> {
    const all: ErgoIndexedBox[] = [];
    let offset = 0;
    while (true) {
      const page = await this.request<ErgoIndexedBox[]>(
        'POST',
        `/blockchain/box/unspent/byAddress?offset=${offset}&limit=${limit}`,
        undefined,
        address,
      );
      if (!Array.isArray(page) || page.length === 0) break;
      all.push(...page);
      if (page.length < limit) break;
      offset += page.length;
    }
    return all;
  }

  async getUnspentBoxesByTokenId(tokenId: string): Promise<ErgoIndexedBox[]> {
    const res = await this.request<ErgoIndexedBox[] | { items: ErgoIndexedBox[] }>(
      'GET',
      `/blockchain/box/unspent/byTokenId/${tokenId}?offset=0&limit=50`,
    );
    return Array.isArray(res) ? res : (res.items ?? []);
  }

  async getLiveSingletonBox(tokenId: string): Promise<ErgoIndexedBox> {
    const boxes = await this.getUnspentBoxesByTokenId(tokenId);
    if (boxes.length !== 1) {
      throw new Error(
        `Expected exactly 1 unspent singleton box for token ${tokenId}, found ${boxes.length}`,
      );
    }
    return boxes[0];
  }

  /**
   * Fetch ALL historical boxes (spent + unspent) that ever held `tokenId`.
   * Used by `reconstructFromErgoNode` to rebuild AVL trees after total DB loss.
   */
  async getAllBoxesByTokenId(tokenId: string, pageLimit = 100): Promise<ErgoIndexedBox[]> {
    const all: ErgoIndexedBox[] = [];
    let offset = 0;
    while (true) {
      const res = await this.request<{ items: ErgoIndexedBox[]; total: number } | ErgoIndexedBox[]>(
        'GET',
        `/blockchain/box/byTokenId/${tokenId}?offset=${offset}&limit=${pageLimit}`,
      );
      const items = Array.isArray(res) ? res : (res.items ?? []);
      if (items.length === 0) break;
      all.push(...items);
      if (items.length < pageLimit) break;
      offset += items.length;
    }
    return all;
  }

  /**
   * Dry-run validate a signed transaction against the stock Ergo node's
   * Sigma interpreter & mempool rules WITHOUT broadcasting it.
   */
  async checkTransaction(signedTxJson: Record<string, unknown>): Promise<string> {
    return this.request<string>('POST', '/transactions/check', signedTxJson);
  }

  /**
   * Broadcast a signed transaction to the Ergo node mempool.
   */
  async submitTransaction(signedTxJson: Record<string, unknown>): Promise<string> {
    return this.request<string>('POST', '/transactions', signedTxJson);
  }

  async waitForIndexedHeight(targetHeight: number, timeoutMs = 60_000): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const idx = await this.getIndexedHeight();
        if (idx.indexedHeight >= targetHeight) return idx.indexedHeight;
      } catch {
        // retry
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`Timed out waiting for Ergo indexedHeight >= ${targetHeight}`);
  }

  async waitForTxConfirmed(txId: string, timeoutMs = 60_000): Promise<ErgoIndexedTx> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const tx = await this.getTransactionById(txId);
        if (tx && tx.inclusionHeight > 0) return tx;
      } catch {
        // not yet mined/indexed
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`Timed out waiting for Ergo tx ${txId} confirmation`);
  }
}
