import { types } from 'node:util';
import { assertNoDuplicateJsonKeys, canonicalJson, sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import type { NativeTwoCycleFailureBindingsV1 } from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { normalizeNativeCommittedReserveInputRefusalV1,
  parseNativeTwoCycleWorkerCommittedReserveRevalidationOperationV1,
  parseNativeTwoCycleParentCommittedReserveRevalidationOperationV1,
  type NativeCommittedReserveInputRefusalV1,
  type NativeTwoCycleWorkerCommittedReserveRevalidationOperationV1,
  type NativeTwoCycleWorkerCommittedReserveRevalidationOperationLineageV1,
  type NativeTwoCycleParentCommittedReserveRevalidationOperationLineageV1 }
  from './substrate-federated-native-committed-reserve-revalidation-operation-v1.js';

const WORKER_SCHEMA = 'e2s.substrate-federated-native-two-cycle-worker-committed-reserve-input-refusal.v1';
const PARENT_SCHEMA = 'e2s.substrate-federated-native-two-cycle-parent-committed-reserve-input-refusal.v1';
const WORKER_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_COMMITTED_RESERVE_INPUT_REFUSAL_V1';
const PARENT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_COMMITTED_RESERVE_INPUT_REFUSAL_V1';
const MAX_BYTES = 16 * 1024;
const BINDINGS = ['configSha256Hex', 'expectedBridgeCommit', 'pathIdentityDigestHex'] as const;
const WORKER_LINEAGE = ['workerFailureText', 'workerRootPhaseV2Text', 'workerCycleStepText',
  'workerCommittedReserveStageText', 'workerRevalidationText', 'workerRevalidationOperationText'] as const;
const PARENT_LINEAGE = [...WORKER_LINEAGE, 'parentCycleStepText', 'parentCommittedReserveStageText',
  'parentRevalidationText', 'parentRevalidationOperationText', 'workerInputRefusalText'] as const;

export interface NativeTwoCycleWorkerCommittedReserveInputRefusalLineageV1
  extends NativeTwoCycleWorkerCommittedReserveRevalidationOperationLineageV1 {
  readonly workerRevalidationOperationText: string;
}
export interface NativeTwoCycleParentCommittedReserveInputRefusalLineageV1
  extends NativeTwoCycleParentCommittedReserveRevalidationOperationLineageV1 {
  readonly parentRevalidationOperationText: string;
  readonly workerInputRefusalText: string;
}
export interface NativeTwoCycleWorkerCommittedReserveInputRefusalV1
  extends Omit<NativeTwoCycleWorkerCommittedReserveRevalidationOperationV1, 'schema' | 'status'>,
  NativeCommittedReserveInputRefusalV1 {
  readonly schema: typeof WORKER_SCHEMA;
  readonly status: 'committed_reserve_input_refusal_failed';
  readonly workerRevalidationOperationReceiptDigestHex: string;
  readonly executionAuthorityRestored: false;
}
export interface NativeTwoCycleParentCommittedReserveInputRefusalV1
  extends Omit<NativeTwoCycleWorkerCommittedReserveInputRefusalV1, 'schema' | 'status'> {
  readonly schema: typeof PARENT_SCHEMA;
  readonly status: 'committed_reserve_input_refusal_diagnostics_validated';
  readonly failureReceiptDigestHex: string;
  readonly parentCycleStepReceiptDigestHex: string;
  readonly parentCommittedReserveStageReceiptDigestHex: string;
  readonly parentRevalidationReceiptDigestHex: string;
  readonly parentRevalidationOperationReceiptDigestHex: string;
  readonly workerInputRefusalReceiptDigestHex: string;
}

/** A closed source predicate, not arbitrary exception data or execution authority. */
export function createNativeTwoCycleWorkerCommittedReserveInputRefusalV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  lineage: Readonly<NativeTwoCycleWorkerCommittedReserveInputRefusalLineageV1>,
  detail: Readonly<NativeCommittedReserveInputRefusalV1>,
): Readonly<NativeTwoCycleWorkerCommittedReserveInputRefusalV1> {
  const b = capture(bindings, BINDINGS, BINDINGS) as unknown as NativeTwoCycleFailureBindingsV1;
  const l = capture(lineage, WORKER_LINEAGE, PARENT_LINEAGE);
  const operationLineage = pick(l, WORKER_LINEAGE.slice(0, -1)) as unknown as NativeTwoCycleWorkerCommittedReserveRevalidationOperationLineageV1;
  const operation = parseNativeTwoCycleWorkerCommittedReserveRevalidationOperationV1(l.workerRevalidationOperationText!, b, operationLineage);
  assertInputOperation(operation.revalidationOperation);
  const refusal = normalizeNativeCommittedReserveInputRefusalV1(detail);
  if (refusal.refusalCode === 'check-ancestry-window-exceeded'
    && operation.revalidationOperation !== 'input-observation-after-check') {
    throw new Error('input ancestry refusal requires after-check observation');
  }
  const { schema: _schema, status: _status, receiptDigestHex, ...previous } = operation;
  return seal({ ...previous, schema: WORKER_SCHEMA, status: 'committed_reserve_input_refusal_failed' as const,
    ...refusal, workerRevalidationOperationReceiptDigestHex: receiptDigestHex,
    executionAuthorityRestored: false as const }, WORKER_DOMAIN);
}

export function parseNativeTwoCycleWorkerCommittedReserveInputRefusalV1(
  text: string, bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  lineage: Readonly<NativeTwoCycleWorkerCommittedReserveInputRefusalLineageV1>,
): Readonly<NativeTwoCycleWorkerCommittedReserveInputRefusalV1> {
  const raw = parse(text);
  const expected = createNativeTwoCycleWorkerCommittedReserveInputRefusalV1(bindings, lineage,
    normalizeNativeCommittedReserveInputRefusalV1({ refusalCode: raw.refusalCode, nodeRole: raw.nodeRole }));
  equal(raw, expected);
  return expected;
}

export function createNativeTwoCycleParentCommittedReserveInputRefusalV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>, failureReceiptDigestHex: string,
  lineage: Readonly<NativeTwoCycleParentCommittedReserveInputRefusalLineageV1>,
): Readonly<NativeTwoCycleParentCommittedReserveInputRefusalV1> {
  const b = capture(bindings, BINDINGS, BINDINGS) as unknown as NativeTwoCycleFailureBindingsV1;
  const l = capture(lineage, PARENT_LINEAGE, PARENT_LINEAGE);
  const oldParentKeys = PARENT_LINEAGE.filter(key => key !== 'parentRevalidationOperationText' && key !== 'workerInputRefusalText');
  const parent = parseNativeTwoCycleParentCommittedReserveRevalidationOperationV1(l.parentRevalidationOperationText!, b,
    failureReceiptDigestHex, pick(l, oldParentKeys) as unknown as NativeTwoCycleParentCommittedReserveRevalidationOperationLineageV1);
  const worker = parseNativeTwoCycleWorkerCommittedReserveInputRefusalV1(l.workerInputRefusalText!, b,
    pick(l, WORKER_LINEAGE) as unknown as NativeTwoCycleWorkerCommittedReserveInputRefusalLineageV1);
  if (parent.workerRevalidationOperationReceiptDigestHex !== worker.workerRevalidationOperationReceiptDigestHex
    || parent.revalidationOperation !== worker.revalidationOperation || parent.cycle !== worker.cycle
    || parent.committedReserveKind !== worker.committedReserveKind) throw new Error('input refusal parent ancestry differs');
  const { schema: _schema, status: _status, receiptDigestHex, ...previous } = worker;
  return seal({ ...previous, schema: PARENT_SCHEMA, status: 'committed_reserve_input_refusal_diagnostics_validated' as const,
    failureReceiptDigestHex: parent.failureReceiptDigestHex,
    parentCycleStepReceiptDigestHex: parent.parentCycleStepReceiptDigestHex,
    parentCommittedReserveStageReceiptDigestHex: parent.parentCommittedReserveStageReceiptDigestHex,
    parentRevalidationReceiptDigestHex: parent.parentRevalidationReceiptDigestHex,
    parentRevalidationOperationReceiptDigestHex: parent.receiptDigestHex,
    workerInputRefusalReceiptDigestHex: receiptDigestHex }, PARENT_DOMAIN);
}

export function parseNativeTwoCycleParentCommittedReserveInputRefusalV1(
  text: string, bindings: Readonly<NativeTwoCycleFailureBindingsV1>, failureReceiptDigestHex: string,
  lineage: Readonly<NativeTwoCycleParentCommittedReserveInputRefusalLineageV1>,
): Readonly<NativeTwoCycleParentCommittedReserveInputRefusalV1> {
  const raw = parse(text);
  const expected = createNativeTwoCycleParentCommittedReserveInputRefusalV1(bindings, failureReceiptDigestHex, lineage);
  equal(raw, expected);
  return expected;
}

function assertInputOperation(operation: string): void {
  if (operation !== 'input-observation-before-check' && operation !== 'input-observation-after-check') {
    throw new Error('input refusal requires an input observation operation');
  }
}
function capture(value: unknown, required: readonly string[], allowed: readonly string[]): Record<string, string> {
  if (types.isProxy(value) || value === null || typeof value !== 'object'
    || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('input refusal requires plain own data');
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string' || !allowed.includes(key)) || required.some(key => !keys.includes(key))) {
    throw new Error('input refusal input fields differ');
  }
  const result: Record<string, string> = {};
  for (const key of keys as string[]) {
    const d = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in d) || !d.enumerable || typeof d.value !== 'string') throw new Error('input refusal input must be own text');
    bounded(d.value); result[key] = d.value;
  }
  return result;
}
function pick(value: Record<string, string>, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map(key => [key, value[key]!]));
}
function bounded(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_BYTES || Buffer.byteLength(value, 'utf8') > MAX_BYTES
    || Buffer.from(value, 'utf8').toString('utf8') !== value) throw new Error('input refusal text bound differs');
  let depth = 0; let quoted = false; let escaped = false;
  for (const char of value) {
    if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; }
    else if (char === '"') quoted = true;
    else if (char === '[' || char === '{') { if (++depth > 64) throw new Error('input refusal depth bound differs'); }
    else if (char === ']' || char === '}') depth--;
  }
}
function parse(text: unknown): Record<string, unknown> {
  bounded(text); assertNoDuplicateJsonKeys(text);
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== 'object' || Array.isArray(value) || text !== `${canonicalJson(value)}\n`) {
    throw new Error('input refusal requires canonical record JSON plus LF');
  }
  return value as Record<string, unknown>;
}
function seal<T extends object>(body: T, domain: string): Readonly<T & { receiptDigestHex: string }> {
  const result = Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, domain) });
  bounded(`${canonicalJson(result)}\n`); return result;
}
function equal(actual: unknown, expected: unknown): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error('input refusal identity, ancestry or digest differs');
}
