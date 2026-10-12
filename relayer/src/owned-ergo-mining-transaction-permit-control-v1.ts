import { randomBytes } from 'node:crypto';
import { types } from 'node:util';

import {
  OWNED_ERGO_MINING_TRANSACTION_APPLICATIONS_V1,
  parseOwnedErgoMiningTransactionHoldReceiptV1,
  parseOwnedErgoMiningTransactionArmReceiptV1,
  parseOwnedErgoMiningTransactionStatusReceiptV1,
} from './owned-ergo-mining-transaction-permit-v1.js';

type HoldReceipt = ReturnType<typeof parseOwnedErgoMiningTransactionHoldReceiptV1>;
type ArmReceipt = ReturnType<typeof parseOwnedErgoMiningTransactionArmReceiptV1>;
type StatusReceipt = ReturnType<typeof parseOwnedErgoMiningTransactionStatusReceiptV1>;
type Watermark = Readonly<{ headerId: string; height: number }>;
const ERROR_MESSAGE = 'Owned Ergo mining transaction permit failed';
const REQUEST_TIMEOUT_MS = 3_000;
const MAX_RESPONSE_BYTES = 16 * 1024;
const URL_PREFIX = 'http://127.0.0.1:9051/mining/';
const CONTROL_OPEN_GUARDS = new WeakMap<object, () => void>();

export interface OwnedErgoMiningTransactionPermitControlV1 {
  readonly hold: () => Promise<HoldReceipt>;
  readonly arm: (transactionIdHex: string) => Promise<ArmReceipt>;
  readonly status: (receipt: ArmReceipt, maximumRequestDurationMs?: number) => Promise<StatusReceipt>;
}

/** Recheck the exact control's lifetime without issuing or reserving an operation. */
export function assertOwnedErgoMiningTransactionPermitControlV1(control: unknown): void {
  try {
    if (typeof control !== 'object' || control === null) fail();
    const open = CONTROL_OPEN_GUARDS.get(control);
    if (open === undefined) fail();
    open();
  } catch {
    throw new Error(ERROR_MESSAGE);
  }
}

/** Transport for the same fresh nonce as permanent Pause; target admission remains separate. */
export function createOwnedErgoMiningTransactionPermitControlV1(
  nonce: string,
  maximumBlockHeight: number | null,
  isPaused: () => boolean,
): OwnedErgoMiningTransactionPermitControlV1 {
  if (!lowerHex(nonce) || typeof isPaused !== 'function'
    || (maximumBlockHeight !== null && (!Number.isInteger(maximumBlockHeight)
      || Object.is(maximumBlockHeight, -0) || maximumBlockHeight < 0
      || maximumBlockHeight > 2_147_483_647))) fail();

  let phase: 'fresh' | 'holding' | 'held' | 'arming' | 'running' | 'failed' = 'fresh';
  let heldParent: Watermark | undefined;
  let currentArm: ArmReceipt | undefined;
  let statusPending = false;
  const operations = new Set<string>();
  const open = (): void => { if (phase === 'failed' || isPaused() !== false) fail(); };
  const operation = (): string => {
    if (operations.size >= 64) fail();
    const id = randomBytes(32).toString('hex');
    if (!lowerHex(id) || id === nonce || operations.has(id)) fail();
    operations.add(id);
    return id;
  };

  const request = async (
    endpoint: 'ownedTransactionHoldV1' | 'ownedTransactionArmV1' | 'ownedTransactionStatusV1',
    operationIdHex: string,
    binding?: Readonly<{ transactionIdHex: string; parent: Watermark }>,
    maximumRequestDurationMs = REQUEST_TIMEOUT_MS,
  ): Promise<string> => {
    let response: Response | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      open();
      const signal = AbortSignal.timeout(maximumRequestDurationMs);
      response = await fetch(URL_PREFIX + endpoint, {
        method: 'POST', redirect: 'error', signal,
        headers: {
          api_key: 'hello',
          'X-Ergo-Owned-Mining-Nonce': nonce,
          'X-Ergo-Owned-Mining-Operation': operationIdHex,
          Accept: 'application/json', 'Accept-Encoding': 'identity',
          ...(binding === undefined ? {} : {
            'X-Ergo-Owned-Mining-Transaction': binding.transactionIdHex,
            'X-Ergo-Owned-Mining-Parent': binding.parent.headerId,
            'X-Ergo-Owned-Mining-Parent-Height': String(binding.parent.height),
          }),
        },
      });
      open();
      if (signal.aborted || response.ok !== true || response.redirected || response.body === null) fail();
      const encoding = response.headers.get('content-encoding');
      if (encoding !== null && encoding.trim().toLowerCase() !== 'identity') fail();
      reader = response.body.getReader();
      const chunks: Buffer[] = [];
      let byteLength = 0;
      for (;;) {
        const chunk = await reader.read();
        open();
        if (chunk.done) break;
        if (!types.isUint8Array(chunk.value) || chunk.value.byteLength === 0) fail();
        byteLength += chunk.value.byteLength;
        if (byteLength > MAX_RESPONSE_BYTES) fail();
        chunks.push(Buffer.from(chunk.value));
      }
      if (signal.aborted) fail();
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
        .decode(Buffer.concat(chunks, byteLength));
    } catch {
      try {
        const cancellation = reader ? reader.cancel() : response?.body?.cancel();
        if (cancellation) void cancellation.catch(() => {});
      } catch { /* Preserve the bounded generic failure. */ }
      throw new Error(ERROR_MESSAGE);
    } finally {
      try { reader?.releaseLock(); } catch { /* Never disclose response errors. */ }
    }
  };

  const hold = async (): Promise<HoldReceipt> => {
    try {
      open();
      if (phase !== 'fresh') fail();
      phase = 'holding';
      const operationIdHex = operation();
      const wireText = await request('ownedTransactionHoldV1', operationIdHex);
      open();
      const receipt = parseOwnedErgoMiningTransactionHoldReceiptV1({
        wireText, expectedOperationIdHex: operationIdHex,
        expectedMaximumBlockHeight: maximumBlockHeight,
      });
      heldParent = receipt.parent;
      phase = 'held';
      return receipt;
    } catch {
      phase = 'failed';
      throw new Error(ERROR_MESSAGE);
    }
  };

  const arm = async (transactionIdHex: string): Promise<ArmReceipt> => {
    try {
      open();
      if (phase !== 'held' || statusPending || heldParent === undefined || !lowerHex(transactionIdHex)
        || heldParent.height > 2_147_483_647 - OWNED_ERGO_MINING_TRANSACTION_APPLICATIONS_V1
        || (maximumBlockHeight !== null && heldParent.height + OWNED_ERGO_MINING_TRANSACTION_APPLICATIONS_V1 > maximumBlockHeight)) fail();
      const parent = heldParent;
      phase = 'arming';
      const operationIdHex = operation();
      const wireText = await request('ownedTransactionArmV1', operationIdHex, { transactionIdHex, parent });
      open();
      const receipt = parseOwnedErgoMiningTransactionArmReceiptV1({
        wireText, expectedOperationIdHex: operationIdHex,
        expectedMaximumBlockHeight: maximumBlockHeight,
        expectedTransactionIdHex: transactionIdHex, expectedInitialParent: parent,
      });
      currentArm = receipt;
      phase = 'running';
      return receipt;
    } catch {
      phase = 'failed';
      throw new Error(ERROR_MESSAGE);
    }
  };

  const status = async (receipt: ArmReceipt, maximumRequestDurationMs = REQUEST_TIMEOUT_MS): Promise<StatusReceipt> => {
    // A caller-supplied copy or stale operation cannot choose the wire binding.
    if (receipt !== currentArm || currentArm === undefined || statusPending
      || (phase !== 'running' && phase !== 'held')) fail();
    const binding = currentArm;
    statusPending = true;
    try {
      open();
      if (typeof maximumRequestDurationMs !== 'number' || !Number.isInteger(maximumRequestDurationMs)
        || Object.is(maximumRequestDurationMs, -0) || maximumRequestDurationMs < 1
        || maximumRequestDurationMs > REQUEST_TIMEOUT_MS) fail();
      const wireText = await request('ownedTransactionStatusV1', binding.operationId, {
        transactionIdHex: binding.transactionId, parent: binding.initialParent,
      }, maximumRequestDurationMs);
      open();
      if (currentArm !== binding) fail();
      const observed = parseOwnedErgoMiningTransactionStatusReceiptV1({
        wireText, expectedOperationIdHex: binding.operationId,
        expectedMaximumBlockHeight: maximumBlockHeight,
        expectedTransactionIdHex: binding.transactionId, expectedInitialParent: binding.initialParent,
      });
      if (observed.completed) {
        if (observed.finalWatermark === null) fail();
        if (phase === 'held' && (heldParent?.headerId !== observed.finalWatermark.headerId
          || heldParent.height !== observed.finalWatermark.height)) fail();
        heldParent = observed.finalWatermark;
        phase = 'held';
      } else if (phase === 'held') fail();
      return observed;
    } catch {
      phase = 'failed';
      throw new Error(ERROR_MESSAGE);
    } finally { statusPending = false; }
  };

  const control = Object.freeze({ hold, arm, status });
  CONTROL_OPEN_GUARDS.set(control, open);
  return control;
}

function lowerHex(value: unknown): value is string {
  return typeof value === 'string' && value.length === 64 && /^[0-9a-f]{64}$/u.test(value);
}

function fail(): never { throw new Error(ERROR_MESSAGE); }
