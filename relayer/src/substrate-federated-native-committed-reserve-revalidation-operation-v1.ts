import { types } from 'node:util';
import { assertNoDuplicateJsonKeys, canonicalJson, sha256CanonicalJson }
  from './ergo-settlement-core/strict-json.js';
import { projectOwnNativeTwoCycleCycleStepFailureV1 }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';
import { projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 }
  from './substrate-federated-native-two-cycle-root-phase-v1.js';
import { type NativeTwoCycleFailureBindingsV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { projectOwnSubstrateFederatedNativeCommittedReserveFailureStageV1,
  projectOwnSubstrateFederatedNativeCommittedReserveKindV1,
  projectSubstrateFederatedNativeCommittedReserveFailureStageV1 }
  from './substrate-federated-native-committed-reserve-failure-v1.js';
import { projectNativeCommittedReserveRevalidationOriginV1,
  parseNativeTwoCycleWorkerCommittedReserveRevalidationV1,
  parseNativeTwoCycleParentCommittedReserveRevalidationV1,
  type NativeTwoCycleWorkerCommittedReserveRevalidationV1,
  type NativeTwoCycleParentCommittedReserveRevalidationLineageV1 }
  from './substrate-federated-native-committed-reserve-revalidation-v1.js';

export const NATIVE_COMMITTED_RESERVE_REVALIDATION_OPERATIONS_V1 = Object.freeze([
  'ingress-binding', 'input-observation-before-check', 'fresh-signed-check',
  'input-observation-after-check', 'post-check-observation-join', 'final-authorizer-binding',
] as const);
export type NativeCommittedReserveRevalidationOperationV1 =
  typeof NATIVE_COMMITTED_RESERVE_REVALIDATION_OPERATIONS_V1[number];
type Operation = NativeCommittedReserveRevalidationOperationV1;
const OPERATIONS = new WeakMap<Error, Readonly<{ token: object; operation: Operation }>>();
const CONFLICTS = new WeakSet<Error>();
const MAX_GRAPH = 64;
// Modern V8 may expose its native lazy stack accessor. Permit only that exact
// accessor pair; never call it or caller-defined accessors during projection.
const nativeStack = Object.getOwnPropertyDescriptor(new Error(), 'stack');
const nativeArrayIterator = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator)?.value;

/** One source invocation owns one private token. This closure returns its input unchanged. */
export function createNativeCommittedReserveRevalidationOperationTaggerV1():
  <T>(value: T, operation: Operation) => T {
  const token = Object.freeze({});
  return <T>(value: T, operation: Operation): T => {
    try {
      if (types.isProxy(value) || !types.isNativeError(value)) return value;
      const error = value as Error;
      const previous = OPERATIONS.get(error);
      if (!isOperation(operation) || (previous !== undefined
        && (previous.token !== token || previous.operation !== operation))) CONFLICTS.add(error);
      else if (previous === undefined && safeError(error) !== null) {
        OPERATIONS.set(error, Object.freeze({ token, operation }));
      }
    } catch { /* Diagnostic failure never replaces the original thrown value. */ }
    return value;
  };
}

/** Last entered operation only: neither an inner refusal predicate nor raw cause. */
export function projectNativeCommittedReserveRevalidationOperationV1(value: unknown): Operation | null {
  try {
    // Finish the VM-native proxy/shape checks before any legacy projector can
    // inspect prototypes or iterate an AggregateError's children.
    const graph = safeGraph(value);
    if (graph === null) return null;
    const legacy = projectSubstrateFederatedNativeCommittedReserveFailureStageV1(value);
    if (legacy?.committedReserveStage !== 'operational-revalidate'
      || projectNativeCommittedReserveRevalidationOriginV1(value) !== 'revalidator-call') return null;
    const seen = new WeakMap<Error, number>();
    const primaryErrors = new Set<Error>();
    const pending = [{ error: value as Error, cleanup: false }];
    let selected: Error | undefined;
    let operation: Operation | null = null;
    while (pending.length > 0) {
      const next = pending.pop()!;
      const error = next.error;
      if (CONFLICTS.has(error)) return null;
      const root = projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(error);
      if (root === 'cycle-1' || root === 'cycle-2') primaryErrors.add(error);
      if (primaryErrors.size > 1) return null;
      const cleanup = next.cleanup || root === 'cleanup';
      const context = cleanup ? 2 : 1;
      if (((seen.get(error) ?? 0) & context) !== 0) continue;
      seen.set(error, (seen.get(error) ?? 0) | context);
      const own = OPERATIONS.get(error);
      if (own !== undefined) {
        const step = projectOwnNativeTwoCycleCycleStepFailureV1(error);
        if (cleanup || (selected !== undefined && selected !== error)
          || projectOwnSubstrateFederatedNativeCommittedReserveFailureStageV1(error) !== 'operational-revalidate'
          || projectOwnSubstrateFederatedNativeCommittedReserveKindV1(error) !== legacy.committedReserveKind
          || step?.step !== 'committed-reserve' || root !== step.cycle
          || projectNativeCommittedReserveRevalidationOriginV1(error) !== 'revalidator-call') return null;
        selected = error;
        operation = own.operation;
      }
      for (const child of graph.get(error)!) pending.push({ error: child, cleanup });
    }
    return selected !== undefined && primaryErrors.has(selected) ? operation : null;
  } catch { return null; }
}

function safeError(value: unknown): Error | null {
  if (types.isProxy(value) || !types.isNativeError(value)) return null;
  let current: object | null = value;
  let depth = 0;
  let errorPrototype = false;
  while (current !== null) {
    if (++depth > MAX_GRAPH || types.isProxy(current)) return null;
    if (current === Error.prototype) errorPrototype = true;
    const keys = current === Object.prototype ? [] : Reflect.ownKeys(current);
    if (keys.length > MAX_GRAPH) return null;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key)!;
      if (!('value' in descriptor)) {
        if (current !== value || key !== 'stack' || nativeStack === undefined
          || descriptor.get !== nativeStack.get || descriptor.set !== nativeStack.set) return null;
      } else if (types.isProxy(descriptor.value)) return null;
    }
    current = Object.getPrototypeOf(current);
  }
  return errorPrototype ? value as Error : null;
}

function safeGraph(value: unknown): Map<Error, readonly Error[]> | null {
  const graph = new Map<Error, readonly Error[]>();
  const active = new Set<Error>();
  let inspected = 0;
  const visit = (candidate: unknown): boolean => {
    if (++inspected > MAX_GRAPH) return false;
    const error = safeError(candidate);
    if (error === null || active.has(error)) return false;
    if (graph.has(error)) return true;
    const descriptor = Object.getOwnPropertyDescriptor(error, 'errors');
    const aggregate = error instanceof AggregateError;
    if (!aggregate) {
      if (descriptor !== undefined) return false;
      graph.set(error, []);
      return true;
    }
    if (descriptor === undefined || !('value' in descriptor)) return false;
    const children: unknown = descriptor.value;
    if (types.isProxy(children) || !Array.isArray(children)
      || Object.getPrototypeOf(children) !== Array.prototype) return false;
    const iterator = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator);
    if (iterator === undefined || !('value' in iterator) || iterator.value !== nativeArrayIterator) return false;
    // Validate the array prototype chain too, before legacy for-of traversal.
    let prototype: object | null = Object.getPrototypeOf(children);
    let depth = 0;
    while (prototype !== null) {
      if (++depth > MAX_GRAPH || types.isProxy(prototype)) return false;
      prototype = Object.getPrototypeOf(prototype);
    }
    const length: unknown = Object.getOwnPropertyDescriptor(children, 'length')?.value;
    if (!Number.isSafeInteger(length) || (length as number) < 0
      || (length as number) > MAX_GRAPH - inspected
      || Reflect.ownKeys(children).length !== (length as number) + 1) return false;
    const edges: Error[] = [];
    graph.set(error, edges);
    active.add(error);
    for (let index = 0; index < (length as number); index++) {
      const child = Object.getOwnPropertyDescriptor(children, String(index));
      if (child === undefined || !('value' in child) || !visit(child.value)) return false;
      edges.push(child.value as Error);
    }
    active.delete(error);
    return true;
  };
  return visit(value) ? graph : null;
}

const WORKER_SCHEMA = 'e2s.substrate-federated-native-two-cycle-worker-committed-reserve-revalidation-operation.v1';
const PARENT_SCHEMA = 'e2s.substrate-federated-native-two-cycle-parent-committed-reserve-revalidation-operation.v1';
const WORKER_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_COMMITTED_RESERVE_REVALIDATION_OPERATION_V1';
const PARENT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_COMMITTED_RESERVE_REVALIDATION_OPERATION_V1';
const MAX_BYTES = 16 * 1024;
const BINDING_KEYS = ['configSha256Hex', 'expectedBridgeCommit', 'pathIdentityDigestHex'] as const;
const WORKER_LINEAGE_KEYS = ['workerFailureText', 'workerRootPhaseV2Text', 'workerCycleStepText',
  'workerCommittedReserveStageText', 'workerRevalidationText'] as const;
const PARENT_LINEAGE_KEYS = [...WORKER_LINEAGE_KEYS, 'parentCycleStepText', 'parentCommittedReserveStageText',
  'parentRevalidationText', 'workerRevalidationOperationText'] as const;
const WORKER_KEYS = ['schema', 'version', 'status', ...BINDING_KEYS, 'workerFailureReceiptDigestHex',
  'workerRootPhaseV2ReceiptDigestHex', 'workerCycleStepReceiptDigestHex', 'workerCommittedReserveStageReceiptDigestHex',
  'workerRevalidationReceiptDigestHex', 'cycle', 'step', 'committedReserveStage', 'committedReserveKind',
  'revalidationOrigin', 'revalidationOperation', 'operationCompletionEstablished', 'rootCleanupEstablished',
  'rawCausePublished', 'receiptDigestHex'] as const;
const PARENT_KEYS = [...WORKER_KEYS, 'failureReceiptDigestHex', 'parentCycleStepReceiptDigestHex',
  'parentCommittedReserveStageReceiptDigestHex', 'parentRevalidationReceiptDigestHex',
  'workerRevalidationOperationReceiptDigestHex'] as const;

export interface NativeTwoCycleWorkerCommittedReserveRevalidationOperationLineageV1 {
  readonly workerFailureText: string;
  readonly workerRootPhaseV2Text: string;
  readonly workerCycleStepText: string;
  readonly workerCommittedReserveStageText: string;
  readonly workerRevalidationText: string;
}
export interface NativeTwoCycleParentCommittedReserveRevalidationOperationLineageV1
  extends NativeTwoCycleWorkerCommittedReserveRevalidationOperationLineageV1,
  NativeTwoCycleParentCommittedReserveRevalidationLineageV1 {
  readonly parentRevalidationText: string;
  readonly workerRevalidationOperationText: string;
}
export interface NativeTwoCycleWorkerCommittedReserveRevalidationOperationV1
  extends Omit<NativeTwoCycleWorkerCommittedReserveRevalidationV1, 'schema' | 'status' | 'revalidationOrigin'> {
  readonly schema: typeof WORKER_SCHEMA;
  readonly status: 'committed_reserve_revalidation_operation_failed';
  readonly revalidationOrigin: 'revalidator-call';
  readonly revalidationOperation: Operation;
  readonly workerRevalidationReceiptDigestHex: string;
}
export interface NativeTwoCycleParentCommittedReserveRevalidationOperationV1
  extends Omit<NativeTwoCycleWorkerCommittedReserveRevalidationOperationV1, 'schema' | 'status'> {
  readonly schema: typeof PARENT_SCHEMA;
  readonly status: 'committed_reserve_revalidation_operation_diagnostics_validated';
  readonly failureReceiptDigestHex: string;
  readonly parentCycleStepReceiptDigestHex: string;
  readonly parentCommittedReserveStageReceiptDigestHex: string;
  readonly parentRevalidationReceiptDigestHex: string;
  readonly workerRevalidationOperationReceiptDigestHex: string;
}

export function createNativeTwoCycleWorkerCommittedReserveRevalidationOperationV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  lineage: Readonly<NativeTwoCycleWorkerCommittedReserveRevalidationOperationLineageV1>, operation: Operation,
): Readonly<NativeTwoCycleWorkerCommittedReserveRevalidationOperationV1> {
  const safeBindings = captureStrings(bindings, BINDING_KEYS, BINDING_KEYS) as unknown as NativeTwoCycleFailureBindingsV1;
  const safeLineage = captureStrings(lineage, WORKER_LINEAGE_KEYS, PARENT_LINEAGE_KEYS) as unknown as
    NativeTwoCycleWorkerCommittedReserveRevalidationOperationLineageV1;
  const worker = parseNativeTwoCycleWorkerCommittedReserveRevalidationV1(
    safeLineage.workerRevalidationText, safeBindings, safeLineage);
  if (worker.revalidationOrigin !== 'revalidator-call') throw new Error('revalidation operation requires revalidator-call');
  const { schema: ignoredSchema, status: ignoredStatus, receiptDigestHex, ...detail } = worker;
  void ignoredSchema; void ignoredStatus;
  const body = Object.freeze({ ...detail, schema: WORKER_SCHEMA,
    status: 'committed_reserve_revalidation_operation_failed' as const,
    revalidationOrigin: 'revalidator-call' as const, revalidationOperation: validateOperation(operation),
    workerRevalidationReceiptDigestHex: receiptDigestHex });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, WORKER_DOMAIN) });
}

export function parseNativeTwoCycleWorkerCommittedReserveRevalidationOperationV1(
  text: string, bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  lineage: Readonly<NativeTwoCycleWorkerCommittedReserveRevalidationOperationLineageV1>,
): Readonly<NativeTwoCycleWorkerCommittedReserveRevalidationOperationV1> {
  const fields = parseRecord(text, WORKER_KEYS);
  const expected = createNativeTwoCycleWorkerCommittedReserveRevalidationOperationV1(
    bindings, lineage, validateOperation(fields.revalidationOperation));
  assertExact(fields, expected);
  return expected;
}

export function createNativeTwoCycleParentCommittedReserveRevalidationOperationV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>, failureReceiptDigestHex: string,
  lineage: Readonly<NativeTwoCycleParentCommittedReserveRevalidationOperationLineageV1>,
): Readonly<NativeTwoCycleParentCommittedReserveRevalidationOperationV1> {
  const safeBindings = captureStrings(bindings, BINDING_KEYS, BINDING_KEYS) as unknown as NativeTwoCycleFailureBindingsV1;
  const safeLineage = captureStrings(lineage, PARENT_LINEAGE_KEYS, PARENT_LINEAGE_KEYS) as unknown as
    NativeTwoCycleParentCommittedReserveRevalidationOperationLineageV1;
  if (typeof failureReceiptDigestHex !== 'string') throw new Error('revalidation operation terminal digest must be text');
  const parent = parseNativeTwoCycleParentCommittedReserveRevalidationV1(
    safeLineage.parentRevalidationText, safeBindings, failureReceiptDigestHex, safeLineage);
  const worker = parseNativeTwoCycleWorkerCommittedReserveRevalidationOperationV1(
    safeLineage.workerRevalidationOperationText, safeBindings, safeLineage);
  if (parent.revalidationOrigin !== 'revalidator-call'
    || parent.workerRevalidationReceiptDigestHex !== worker.workerRevalidationReceiptDigestHex
    || parent.cycle !== worker.cycle || parent.committedReserveKind !== worker.committedReserveKind) {
    throw new Error('revalidation operation parent ancestry differs');
  }
  const { schema: ignoredSchema, status: ignoredStatus, receiptDigestHex, ...detail } = worker;
  void ignoredSchema; void ignoredStatus;
  const body = Object.freeze({ ...detail, schema: PARENT_SCHEMA,
    status: 'committed_reserve_revalidation_operation_diagnostics_validated' as const,
    failureReceiptDigestHex: parent.failureReceiptDigestHex,
    parentCycleStepReceiptDigestHex: parent.parentCycleStepReceiptDigestHex,
    parentCommittedReserveStageReceiptDigestHex: parent.parentCommittedReserveStageReceiptDigestHex,
    parentRevalidationReceiptDigestHex: parent.receiptDigestHex,
    workerRevalidationOperationReceiptDigestHex: receiptDigestHex });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, PARENT_DOMAIN) });
}

export function parseNativeTwoCycleParentCommittedReserveRevalidationOperationV1(
  text: string, bindings: Readonly<NativeTwoCycleFailureBindingsV1>, failureReceiptDigestHex: string,
  lineage: Readonly<NativeTwoCycleParentCommittedReserveRevalidationOperationLineageV1>,
): Readonly<NativeTwoCycleParentCommittedReserveRevalidationOperationV1> {
  const fields = parseRecord(text, PARENT_KEYS);
  const expected = createNativeTwoCycleParentCommittedReserveRevalidationOperationV1(bindings, failureReceiptDigestHex, lineage);
  assertExact(fields, expected);
  return expected;
}

function isOperation(value: unknown): value is Operation {
  return typeof value === 'string' && NATIVE_COMMITTED_RESERVE_REVALIDATION_OPERATIONS_V1.includes(value as Operation);
}
function validateOperation(value: unknown): Operation {
  if (!isOperation(value)) throw new Error('revalidation operation is unsupported');
  return value;
}
function captureStrings(value: unknown, required: readonly string[], allowed: readonly string[]): Record<string, string> {
  if (types.isProxy(value) || value === null || typeof value !== 'object'
    || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('revalidation operation input must be plain own data');
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string' || !allowed.includes(key))
    || required.some(key => !keys.includes(key))) throw new Error('revalidation operation input fields differ');
  const result: Record<string, string> = {};
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in descriptor) || typeof descriptor.value !== 'string') throw new Error('revalidation operation input must be text');
    result[key] = descriptor.value;
  }
  return result;
}
function parseRecord(text: string, keys: readonly string[]): Record<string, unknown> {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BYTES) throw new Error('revalidation operation text exceeds bound');
  assertNoDuplicateJsonKeys(text);
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length
    || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new Error('revalidation operation companion fields differ');
  }
  if (text !== `${canonicalJson(value)}\n`) throw new Error('revalidation operation text is not canonical JSON');
  return value as Record<string, unknown>;
}
function assertExact(fields: Record<string, unknown>, expected: object): void {
  if (canonicalJson(fields) !== canonicalJson(expected)) throw new Error('revalidation operation identity, ancestry or digest differs');
}
