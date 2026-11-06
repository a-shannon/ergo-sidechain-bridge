import { types } from 'node:util';

import { assertNoDuplicateJsonKeys } from './ergo-settlement-core/strict-json.js';

const SCHEMA = 'e2s.owned-mining-submission-pause.v1' as const;
const MAX_WIRE_BYTES = 16 * 1024;
const MAX_SCALA_INT = 2_147_483_647;
const ERROR_MESSAGE = 'Invalid owned Ergo mining submission pause receipt';

export interface OwnedErgoMiningSubmissionPauseReceiptInputV1 {
  readonly wireText: string;
  readonly expectedOperationIdHex: string;
  readonly expectedMaximumBlockHeight: number | null;
}

export interface OwnedErgoMiningSubmissionPauseReceiptV1 {
  readonly schema: typeof SCHEMA;
  readonly operationId: string;
  readonly submissionPaused: true;
  readonly maximumBlockHeight: number | null;
  readonly latestAppliedBlock: Readonly<{ headerId: string; height: number }> | null;
}

/** Decode a bound pause receipt; this does not authenticate a node or authorize an operation. */
export function parseOwnedErgoMiningSubmissionPauseReceiptV1(
  input: OwnedErgoMiningSubmissionPauseReceiptInputV1,
): OwnedErgoMiningSubmissionPauseReceiptV1 {
  try {
    const argumentsSnapshot = ownDataRecord(input, [
      'wireText', 'expectedOperationIdHex', 'expectedMaximumBlockHeight',
    ]);
    const wireText = argumentsSnapshot.wireText;
    const expectedOperation = argumentsSnapshot.expectedOperationIdHex;
    const expectedMaximum = argumentsSnapshot.expectedMaximumBlockHeight;
    requireLowerHex(expectedOperation);
    requireMaximum(expectedMaximum);
    if (typeof wireText !== 'string' || wireText.length > MAX_WIRE_BYTES
      || Buffer.byteLength(wireText, 'utf8') > MAX_WIRE_BYTES) fail();

    assertNoDuplicateJsonKeys(wireText);
    const receipt = ownDataRecord(JSON.parse(wireText), [
      'schema', 'operationId', 'submissionPaused', 'maximumBlockHeight', 'latestAppliedBlock',
    ]);
    if (receipt.schema !== SCHEMA || receipt.submissionPaused !== true) fail();
    requireLowerHex(receipt.operationId);
    requireMaximum(receipt.maximumBlockHeight);
    if (receipt.operationId !== expectedOperation || receipt.maximumBlockHeight !== expectedMaximum) fail();

    let latestAppliedBlock: OwnedErgoMiningSubmissionPauseReceiptV1['latestAppliedBlock'] = null;
    if (receipt.latestAppliedBlock !== null) {
      const watermark = ownDataRecord(receipt.latestAppliedBlock, ['headerId', 'height']);
      requireLowerHex(watermark.headerId);
      if (!canonicalInt(watermark.height, 1)
        || (receipt.maximumBlockHeight !== null && watermark.height > receipt.maximumBlockHeight)) fail();
      latestAppliedBlock = Object.freeze({ headerId: watermark.headerId, height: watermark.height });
    }

    return Object.freeze({
      schema: SCHEMA,
      operationId: receipt.operationId,
      submissionPaused: true,
      maximumBlockHeight: receipt.maximumBlockHeight,
      latestAppliedBlock,
    });
  } catch {
    // Parser diagnostics and caller-controlled text must not escape this boundary.
    throw new Error(ERROR_MESSAGE);
  }
}

function ownDataRecord(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || types.isProxy(value)) fail();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== expectedKeys.length
    || keys.some(key => typeof key !== 'string' || !expectedKeys.includes(key))) fail();
  const snapshot: Record<string, unknown> = Object.create(null);
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail();
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function requireLowerHex(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) fail();
}

function canonicalInt(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && !Object.is(value, -0)
    && value >= minimum && value <= MAX_SCALA_INT;
}

function requireMaximum(value: unknown): asserts value is number | null {
  if (value !== null && !canonicalInt(value, 0)) fail();
}

function fail(): never {
  throw new Error(ERROR_MESSAGE);
}
