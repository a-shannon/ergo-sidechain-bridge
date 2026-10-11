import { createHash, randomBytes } from 'node:crypto';
import { types } from 'node:util';

import {
  parseOwnedErgoMiningSubmissionPauseReceiptV1,
  type OwnedErgoMiningSubmissionPauseReceiptV1,
} from './owned-ergo-mining-submission-v1.js';

const PAUSE_URL = 'http://127.0.0.1:9051/mining/ownedSubmissionPauseV1';
const REQUEST_TIMEOUT_MS = 3_000;
const MAX_RESPONSE_BYTES = 16 * 1024;
const ERROR_MESSAGE = 'Owned Ergo mining submission pause failed';

export interface OwnedErgoMiningSubmissionControlV1 {
  readonly nonceSha256Hex: string;
  readonly maximumBlockHeight: number | null;
  readonly pause: () => Promise<OwnedErgoMiningSubmissionPauseReceiptV1>;
}

/** One-use transport; the caller must separately establish the owned target's admission. */
export function createOwnedErgoMiningSubmissionControlV1(
  maximumBlockHeight: number | null = null,
): OwnedErgoMiningSubmissionControlV1 {
  if (maximumBlockHeight !== null && (typeof maximumBlockHeight !== 'number'
    || !Number.isInteger(maximumBlockHeight) || Object.is(maximumBlockHeight, -0)
    || maximumBlockHeight < 0 || maximumBlockHeight > 2_147_483_647)) fail();

  try {
    const nonce = randomBytes(32).toString('hex');
    const nonceSha256Hex = createHash('sha256').update(nonce, 'utf8').digest('hex');
    let claimed = false;
    const pause = async (): Promise<OwnedErgoMiningSubmissionPauseReceiptV1> => {
      if (claimed) fail();
      claimed = true;
      let response: Response | undefined;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const operationIdHex = randomBytes(32).toString('hex');
        const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
        response = await fetch(PAUSE_URL, {
          method: 'POST',
          redirect: 'error',
          signal,
          headers: {
            api_key: 'hello',
            'X-Ergo-Owned-Mining-Nonce': nonce,
            'X-Ergo-Owned-Mining-Operation': operationIdHex,
            Accept: 'application/json',
            'Accept-Encoding': 'identity',
          },
        });
        if (signal.aborted || response.ok !== true || response.redirected || response.body === null) fail();
        const encoding = response.headers.get('content-encoding');
        if (encoding !== null && encoding.trim().toLowerCase() !== 'identity') fail();
        reader = response.body.getReader();
        const chunks: Buffer[] = [];
        let byteLength = 0;
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          if (!types.isUint8Array(chunk.value) || chunk.value.byteLength === 0) fail();
          byteLength += chunk.value.byteLength;
          if (byteLength > MAX_RESPONSE_BYTES) fail();
          chunks.push(Buffer.from(chunk.value));
        }
        if (signal.aborted) fail();
        const wireText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
          .decode(Buffer.concat(chunks, byteLength));
        return parseOwnedErgoMiningSubmissionPauseReceiptV1({
          wireText, expectedOperationIdHex: operationIdHex, expectedMaximumBlockHeight: maximumBlockHeight,
        });
      } catch {
        // Attempt cancellation without waiting on an unbounded cancellation promise.
        try {
          const cancellation = reader ? reader.cancel() : response?.body?.cancel();
          if (cancellation) void cancellation.catch(() => {});
        } catch { /* Preserve the generic failure if cancellation also fails. */ }
        throw new Error(ERROR_MESSAGE);
      } finally {
        try { reader?.releaseLock(); } catch { /* No response or reader error is disclosed. */ }
      }
    };
    return Object.freeze({ nonceSha256Hex, maximumBlockHeight, pause });
  } catch {
    throw new Error(ERROR_MESSAGE);
  }
}

function fail(): never {
  throw new Error(ERROR_MESSAGE);
}
