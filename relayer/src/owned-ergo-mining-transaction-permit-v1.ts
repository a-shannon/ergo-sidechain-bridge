import { types } from 'node:util';

import { assertNoDuplicateJsonKeys } from './ergo-settlement-core/strict-json.js';

const MAX_WIRE_BYTES = 16 * 1024;
const MAX_SCALA_INT = 2_147_483_647;
const CONFIRMATIONS = 10;
// The inclusion block has depth zero in the node's indexed transaction API.
export const OWNED_ERGO_MINING_TRANSACTION_APPLICATIONS_V1 = CONFIRMATIONS + 1;
const ERROR_MESSAGE = 'Invalid owned Ergo mining transaction permit receipt';
const HOLD_SCHEMA = 'e2s.owned-mining-transaction-hold.v1' as const;
const ARM_SCHEMA = 'e2s.owned-mining-transaction-arm.v1' as const;
const STATUS_SCHEMA = 'e2s.owned-mining-transaction-status.v1' as const;

export interface OwnedErgoMiningTransactionBlockV1 {
  readonly headerId: string;
  readonly height: number;
}

export interface OwnedErgoMiningTransactionHoldReceiptInputV1 {
  readonly wireText: string;
  readonly expectedOperationIdHex: string;
  readonly expectedMaximumBlockHeight: number | null;
}

export interface OwnedErgoMiningTransactionArmReceiptInputV1 extends OwnedErgoMiningTransactionHoldReceiptInputV1 {
  readonly expectedTransactionIdHex: string;
  readonly expectedInitialParent: OwnedErgoMiningTransactionBlockV1;
}

export type OwnedErgoMiningTransactionStatusReceiptInputV1 = OwnedErgoMiningTransactionArmReceiptInputV1;

export interface OwnedErgoMiningTransactionHoldReceiptV1 {
  readonly schema: typeof HOLD_SCHEMA;
  readonly operationId: string;
  readonly submissionHeld: true;
  readonly maximumBlockHeight: number | null;
  readonly parent: OwnedErgoMiningTransactionBlockV1;
}

export interface OwnedErgoMiningTransactionArmReceiptV1 {
  readonly schema: typeof ARM_SCHEMA;
  readonly operationId: string;
  readonly transactionId: string;
  readonly initialParent: OwnedErgoMiningTransactionBlockV1;
  readonly accepted: true;
  readonly confirmations: 10;
  readonly maximumBlockHeight: number | null;
}

export interface OwnedErgoMiningTransactionStatusReceiptV1 {
  readonly schema: typeof STATUS_SCHEMA;
  readonly operationId: string;
  readonly transactionId: string;
  readonly initialParent: OwnedErgoMiningTransactionBlockV1;
  readonly completed: boolean;
  readonly finalWatermark: OwnedErgoMiningTransactionBlockV1 | null;
  readonly confirmations: 10;
  readonly maximumBlockHeight: number | null;
}

/** Strict wire binding only; these parsers do not authenticate a node or grant mining authority. */
export function parseOwnedErgoMiningTransactionHoldReceiptV1(
  input: OwnedErgoMiningTransactionHoldReceiptInputV1,
): OwnedErgoMiningTransactionHoldReceiptV1 {
  return guarded(() => {
    const args = readArguments(input, false);
    const wire = ownDataRecord(readWire(args.wireText), [
      'schema', 'operationId', 'submissionHeld', 'maximumBlockHeight', 'parent',
    ]);
    bindCommon(wire, args, HOLD_SCHEMA);
    if (wire.submissionHeld !== true) fail();
    const parent = readBlock(wire.parent);
    if (args.maximum !== null && parent.height > args.maximum) fail();
    return Object.freeze({ schema: HOLD_SCHEMA, operationId: args.operation, submissionHeld: true,
      maximumBlockHeight: args.maximum, parent });
  });
}

export function parseOwnedErgoMiningTransactionArmReceiptV1(
  input: OwnedErgoMiningTransactionArmReceiptInputV1,
): OwnedErgoMiningTransactionArmReceiptV1 {
  return guarded(() => {
    const args = readArguments(input, true);
    const wire = ownDataRecord(readWire(args.wireText), [
      'schema', 'operationId', 'transactionId', 'initialParent', 'accepted', 'confirmations', 'maximumBlockHeight',
    ]);
    bindCommon(wire, args, ARM_SCHEMA);
    const binding = bindTransaction(wire, args);
    if (wire.accepted !== true) fail();
    return Object.freeze({ schema: ARM_SCHEMA, operationId: args.operation, ...binding,
      accepted: true, confirmations: CONFIRMATIONS, maximumBlockHeight: args.maximum });
  });
}

export function parseOwnedErgoMiningTransactionStatusReceiptV1(
  input: OwnedErgoMiningTransactionStatusReceiptInputV1,
): OwnedErgoMiningTransactionStatusReceiptV1 {
  return guarded(() => {
    const args = readArguments(input, true);
    const wire = ownDataRecord(readWire(args.wireText), [
      'schema', 'operationId', 'transactionId', 'initialParent', 'completed', 'finalWatermark',
      'confirmations', 'maximumBlockHeight',
    ]);
    bindCommon(wire, args, STATUS_SCHEMA);
    const binding = bindTransaction(wire, args);
    if (typeof wire.completed !== 'boolean') fail();
    let finalWatermark: OwnedErgoMiningTransactionBlockV1 | null = null;
    if (wire.completed) {
      finalWatermark = readBlock(wire.finalWatermark);
      if (finalWatermark.height !== binding.initialParent.height + OWNED_ERGO_MINING_TRANSACTION_APPLICATIONS_V1) fail();
    } else if (wire.finalWatermark !== null) fail();
    return Object.freeze({ schema: STATUS_SCHEMA, operationId: args.operation, ...binding,
      completed: wire.completed, finalWatermark, confirmations: CONFIRMATIONS, maximumBlockHeight: args.maximum });
  });
}

function readArguments(input: unknown, transaction: boolean) {
  const args = ownDataRecord(input, ['wireText', 'expectedOperationIdHex', 'expectedMaximumBlockHeight',
    ...(transaction ? ['expectedTransactionIdHex', 'expectedInitialParent'] : [])]);
  requireHex(args.expectedOperationIdHex);
  requireMaximum(args.expectedMaximumBlockHeight);
  let expectedTransaction: string | null = null;
  let expectedParent: OwnedErgoMiningTransactionBlockV1 | null = null;
  if (transaction) {
    requireHex(args.expectedTransactionIdHex);
    expectedTransaction = args.expectedTransactionIdHex;
    expectedParent = readBlock(args.expectedInitialParent);
    requireEndpoint(expectedParent, args.expectedMaximumBlockHeight);
  }
  return { wireText: args.wireText, operation: args.expectedOperationIdHex,
    maximum: args.expectedMaximumBlockHeight, expectedTransaction, expectedParent };
}

function bindCommon(wire: Record<string, unknown>, args: ReturnType<typeof readArguments>, schema: string): void {
  requireHex(wire.operationId);
  requireMaximum(wire.maximumBlockHeight);
  if (wire.schema !== schema || wire.operationId !== args.operation || wire.maximumBlockHeight !== args.maximum) fail();
}

function bindTransaction(wire: Record<string, unknown>, args: ReturnType<typeof readArguments>) {
  requireHex(wire.transactionId);
  const initialParent = readBlock(wire.initialParent);
  if (!args.expectedParent || wire.transactionId !== args.expectedTransaction
    || initialParent.headerId !== args.expectedParent.headerId || initialParent.height !== args.expectedParent.height
    || wire.confirmations !== CONFIRMATIONS) fail();
  requireEndpoint(initialParent, args.maximum);
  return { transactionId: wire.transactionId, initialParent };
}

function requireEndpoint(parent: OwnedErgoMiningTransactionBlockV1, maximum: number | null): void {
  if (parent.height > MAX_SCALA_INT - OWNED_ERGO_MINING_TRANSACTION_APPLICATIONS_V1
    || (maximum !== null && parent.height + OWNED_ERGO_MINING_TRANSACTION_APPLICATIONS_V1 > maximum)) fail();
}

function readBlock(input: unknown): OwnedErgoMiningTransactionBlockV1 {
  const value = ownDataRecord(input, ['headerId', 'height']);
  requireHex(value.headerId);
  if (!canonicalInt(value.height, 1)) fail();
  return Object.freeze({ headerId: value.headerId, height: value.height });
}

function readWire(value: unknown): unknown {
  if (typeof value !== 'string' || value.length > MAX_WIRE_BYTES
    || Buffer.byteLength(value, 'utf8') > MAX_WIRE_BYTES) fail();
  // JSON.parse would erase fractional/exponent spellings and negative zero.
  // Scala's Json.fromInt emits only unsigned decimal tokens on these schemas.
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (character === '\\') index += 1;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '-' || /[0-9]/u.test(character)) {
      const start = index;
      while (index < value.length && !/[\s,}\]]/u.test(value[index])) index += 1;
      if (!/^(?:0|[1-9][0-9]*)$/u.test(value.slice(start, index))) fail();
      index -= 1;
    }
  }
  assertNoDuplicateJsonKeys(value);
  return JSON.parse(value);
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

function requireHex(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length !== 64 || !/^[0-9a-f]{64}$/u.test(value)) fail();
}

function canonicalInt(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && !Object.is(value, -0)
    && value >= minimum && value <= MAX_SCALA_INT;
}

function requireMaximum(value: unknown): asserts value is number | null {
  if (value !== null && !canonicalInt(value, 0)) fail();
}

function guarded<T>(read: () => T): T {
  try { return read(); } catch { throw new Error(ERROR_MESSAGE); }
}

function fail(): never { throw new Error(ERROR_MESSAGE); }
