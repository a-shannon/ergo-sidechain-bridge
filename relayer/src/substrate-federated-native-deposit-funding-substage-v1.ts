import { types } from 'node:util';

import { assertNoDuplicateJsonKeys, canonicalJson, sha256CanonicalJson }
  from './ergo-settlement-core/strict-json.js';
import { projectOwnNativeTwoCycleCycleStepFailureV1 }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';
import { parseNativeTwoCycleWorkerCycleStepV1, parseNativeTwoCycleParentCycleStepV1 }
  from './substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { parseNativeTwoCycleWorkerFailureDiagnosticV1, type NativeTwoCycleFailureBindingsV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 }
  from './substrate-federated-native-two-cycle-root-phase-v1.js';
import { parseNativeTwoCycleWorkerRootPhaseV2 }
  from './substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';

export const NATIVE_DEPOSIT_FUNDING_SUBSTAGES_V1 = Object.freeze([
  'owned-transaction-hold',
  'post-hold-owner-custody-guard',
  'prior-confirmation-revalidation',
  'post-revalidation-owner-custody-guard',
  'owned-reward-input-discovery',
  'post-discovery-owner-custody-guard',
  'owned-reward-input-provenance',
  'held-funding-equality',
] as const);

export type NativeDepositFundingSubstageV1 =
  typeof NATIVE_DEPOSIT_FUNDING_SUBSTAGES_V1[number];

type Substage = NativeDepositFundingSubstageV1;
type Cycle = 'cycle-1' | 'cycle-2';

const SUBSTAGES = new WeakMap<Error, Readonly<{ token: object; substage: Substage }>>();
const CONFLICTS = new WeakSet<Error>();
const MAX_GRAPH = 64;
const nativeStack = Object.getOwnPropertyDescriptor(new Error(), 'stack');
const nativeArrayIterator = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator)?.value;

/** One source invocation owns one private token and never replaces its thrown value. */
export function createNativeDepositFundingSubstageTaggerV1():
  <T>(value: T, substage: Substage | null) => T {
  const token = Object.freeze({});
  return <T>(value: T, substage: Substage | null): T => {
    try {
      if (types.isProxy(value) || !types.isNativeError(value)) return value;
      const error = value as Error;
      const previous = SUBSTAGES.get(error);
      if (!isSubstage(substage) || (previous !== undefined
        && (previous.token !== token || previous.substage !== substage))) {
        CONFLICTS.add(error);
      } else if (previous === undefined && safeError(error) !== null) {
        SUBSTAGES.set(error, Object.freeze({ token, substage }));
      }
    } catch { /* Optional diagnostics never replace the original thrown value. */ }
    return value;
  };
}

/** Prospective last-entered substage only; no raw cause or completion inference. */
export function projectNativeDepositFundingSubstageV1(value: unknown): Substage | null {
  try {
    const graph = safeGraph(value);
    if (graph === null) return null;
    const seen = new WeakMap<Error, number>();
    const primaryErrors = new Set<Error>();
    const pending = [{ error: value as Error, cleanup: false }];
    let selected: Error | undefined;
    let substage: Substage | null = null;
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
      const own = SUBSTAGES.get(error);
      if (own !== undefined) {
        const step = projectOwnNativeTwoCycleCycleStepFailureV1(error);
        if (cleanup || (selected !== undefined && selected !== error)
          || step?.step !== 'deposit-funding' || root !== step.cycle) return null;
        selected = error;
        substage = own.substage;
      }
      for (const child of graph.get(error)!) pending.push({ error: child, cleanup });
    }
    return selected !== undefined && primaryErrors.has(selected) ? substage : null;
  } catch { return null; }
}

function isSubstage(value: unknown): value is Substage {
  return typeof value === 'string'
    && NATIVE_DEPOSIT_FUNDING_SUBSTAGES_V1.includes(value as Substage);
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
    if (iterator === undefined || !('value' in iterator)
      || iterator.value !== nativeArrayIterator) return false;
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

const WORKER_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-worker-deposit-funding-substage.v1';
const PARENT_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-parent-deposit-funding-substage.v1';
const WORKER_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_DEPOSIT_FUNDING_SUBSTAGE_V1';
const PARENT_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_DEPOSIT_FUNDING_SUBSTAGE_V1';
const MAX_BYTES = 16 * 1024;
const BINDING_KEYS = ['configSha256Hex', 'expectedBridgeCommit', 'pathIdentityDigestHex'] as const;
const WORKER_LINEAGE_KEYS = ['workerFailureText', 'workerRootPhaseV2Text', 'workerCycleStepText'] as const;
const PARENT_LINEAGE_KEYS = [...WORKER_LINEAGE_KEYS, 'parentCycleStepText',
  'workerDepositFundingSubstageText'] as const;
const WORKER_KEYS = ['schema', 'version', 'status', ...BINDING_KEYS,
  'workerFailureReceiptDigestHex', 'workerRootPhaseV2ReceiptDigestHex',
  'workerCycleStepReceiptDigestHex', 'cycle', 'step', 'depositFundingSubstage',
  'operationCompletionEstablished', 'rootCleanupEstablished', 'rawCausePublished',
  'receiptDigestHex'] as const;
const PARENT_KEYS = [...WORKER_KEYS, 'failureReceiptDigestHex',
  'parentCycleStepReceiptDigestHex', 'workerDepositFundingSubstageReceiptDigestHex'] as const;

export interface NativeTwoCycleWorkerDepositFundingSubstageLineageV1 {
  readonly workerFailureText: string;
  readonly workerRootPhaseV2Text: string;
  readonly workerCycleStepText: string;
}

export interface NativeTwoCycleParentDepositFundingSubstageLineageV1
  extends NativeTwoCycleWorkerDepositFundingSubstageLineageV1 {
  readonly parentCycleStepText: string;
  readonly workerDepositFundingSubstageText: string;
}

interface DepositFundingSubstageDetailV1 {
  readonly cycle: Cycle;
  readonly step: 'deposit-funding';
  readonly depositFundingSubstage: Substage;
  readonly operationCompletionEstablished: false;
  readonly rootCleanupEstablished: false;
  readonly rawCausePublished: false;
}

export interface NativeTwoCycleWorkerDepositFundingSubstageV1
  extends NativeTwoCycleFailureBindingsV1, DepositFundingSubstageDetailV1 {
  readonly schema: typeof WORKER_SCHEMA;
  readonly version: 1;
  readonly status: 'deposit_funding_substage_failed';
  readonly workerFailureReceiptDigestHex: string;
  readonly workerRootPhaseV2ReceiptDigestHex: string;
  readonly workerCycleStepReceiptDigestHex: string;
  readonly receiptDigestHex: string;
}

export interface NativeTwoCycleParentDepositFundingSubstageV1
  extends Omit<NativeTwoCycleWorkerDepositFundingSubstageV1, 'schema' | 'status'> {
  readonly schema: typeof PARENT_SCHEMA;
  readonly status: 'deposit_funding_substage_diagnostics_validated';
  readonly failureReceiptDigestHex: string;
  readonly parentCycleStepReceiptDigestHex: string;
  readonly workerDepositFundingSubstageReceiptDigestHex: string;
}

export function createNativeTwoCycleWorkerDepositFundingSubstageV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  lineage: Readonly<NativeTwoCycleWorkerDepositFundingSubstageLineageV1>,
  substage: Substage,
): Readonly<NativeTwoCycleWorkerDepositFundingSubstageV1> {
  const safeBindings = captureStrings(bindings, BINDING_KEYS) as unknown as NativeTwoCycleFailureBindingsV1;
  const safeLineage = captureStrings(lineage, WORKER_LINEAGE_KEYS) as unknown as
    NativeTwoCycleWorkerDepositFundingSubstageLineageV1;
  const failure = parseNativeTwoCycleWorkerFailureDiagnosticV1(
    safeLineage.workerFailureText, safeBindings);
  const root = parseNativeTwoCycleWorkerRootPhaseV2(safeLineage.workerRootPhaseV2Text, safeBindings);
  const step = parseNativeTwoCycleWorkerCycleStepV1(safeLineage.workerCycleStepText,
    safeBindings, safeLineage.workerFailureText, safeLineage.workerRootPhaseV2Text);
  if (failure.stage !== 'root-or-cleanup' || root.primaryPhase !== step.cycle
    || step.step !== 'deposit-funding') {
    throw new Error('deposit funding substage requires exact cycle deposit-funding ancestry');
  }
  const body = Object.freeze({
    schema: WORKER_SCHEMA, version: 1 as const,
    status: 'deposit_funding_substage_failed' as const,
    ...safeBindings,
    workerFailureReceiptDigestHex: failure.receiptDigestHex,
    workerRootPhaseV2ReceiptDigestHex: root.receiptDigestHex,
    workerCycleStepReceiptDigestHex: step.receiptDigestHex,
    cycle: step.cycle,
    step: 'deposit-funding' as const,
    depositFundingSubstage: validateSubstage(substage),
    operationCompletionEstablished: false as const,
    rootCleanupEstablished: false as const,
    rawCausePublished: false as const,
  });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, WORKER_DOMAIN) });
}

export function parseNativeTwoCycleWorkerDepositFundingSubstageV1(
  text: string,
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  lineage: Readonly<NativeTwoCycleWorkerDepositFundingSubstageLineageV1>,
): Readonly<NativeTwoCycleWorkerDepositFundingSubstageV1> {
  const fields = parseRecord(text, WORKER_KEYS);
  const expected = createNativeTwoCycleWorkerDepositFundingSubstageV1(
    bindings, lineage, validateSubstage(fields.depositFundingSubstage));
  assertExact(fields, expected);
  return expected;
}

export function createNativeTwoCycleParentDepositFundingSubstageV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  failureReceiptDigestHex: string,
  lineage: Readonly<NativeTwoCycleParentDepositFundingSubstageLineageV1>,
): Readonly<NativeTwoCycleParentDepositFundingSubstageV1> {
  const safeBindings = captureStrings(bindings, BINDING_KEYS) as unknown as NativeTwoCycleFailureBindingsV1;
  const safeLineage = captureStrings(lineage, PARENT_LINEAGE_KEYS) as unknown as
    NativeTwoCycleParentDepositFundingSubstageLineageV1;
  if (typeof failureReceiptDigestHex !== 'string') {
    throw new Error('deposit funding substage terminal digest must be text');
  }
  const workerLineage = Object.freeze({
    workerFailureText: safeLineage.workerFailureText,
    workerRootPhaseV2Text: safeLineage.workerRootPhaseV2Text,
    workerCycleStepText: safeLineage.workerCycleStepText,
  });
  const parentStep = parseNativeTwoCycleParentCycleStepV1(safeLineage.parentCycleStepText,
    safeBindings, failureReceiptDigestHex, safeLineage.workerFailureText,
    safeLineage.workerRootPhaseV2Text, safeLineage.workerCycleStepText);
  const worker = parseNativeTwoCycleWorkerDepositFundingSubstageV1(
    safeLineage.workerDepositFundingSubstageText, safeBindings, workerLineage);
  if (parentStep.cycle !== worker.cycle || parentStep.step !== 'deposit-funding'
    || parentStep.workerCycleStepReceiptDigestHex !== worker.workerCycleStepReceiptDigestHex) {
    throw new Error('deposit funding substage parent ancestry differs');
  }
  const { schema: ignoredSchema, status: ignoredStatus, receiptDigestHex, ...detail } = worker;
  void ignoredSchema; void ignoredStatus;
  const body = Object.freeze({
    ...detail,
    schema: PARENT_SCHEMA,
    status: 'deposit_funding_substage_diagnostics_validated' as const,
    failureReceiptDigestHex: parentStep.failureReceiptDigestHex,
    parentCycleStepReceiptDigestHex: parentStep.receiptDigestHex,
    workerDepositFundingSubstageReceiptDigestHex: receiptDigestHex,
  });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, PARENT_DOMAIN) });
}

export function parseNativeTwoCycleParentDepositFundingSubstageV1(
  text: string,
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  failureReceiptDigestHex: string,
  lineage: Readonly<NativeTwoCycleParentDepositFundingSubstageLineageV1>,
): Readonly<NativeTwoCycleParentDepositFundingSubstageV1> {
  const fields = parseRecord(text, PARENT_KEYS);
  const expected = createNativeTwoCycleParentDepositFundingSubstageV1(
    bindings, failureReceiptDigestHex, lineage);
  assertExact(fields, expected);
  return expected;
}

function validateSubstage(value: unknown): Substage {
  if (!isSubstage(value)) throw new Error('deposit funding substage is unsupported');
  return value;
}

function captureStrings(value: unknown, keys: readonly string[]): Record<string, string> {
  if (types.isProxy(value) || value === null || typeof value !== 'object'
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('deposit funding substage input must be plain own data');
  }
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key))) {
    throw new Error('deposit funding substage input fields differ');
  }
  const result: Record<string, string> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in descriptor) || !descriptor.enumerable || typeof descriptor.value !== 'string') {
      throw new Error('deposit funding substage input must be enumerable text');
    }
    result[key] = descriptor.value;
  }
  return result;
}

function parseRecord(text: string, keys: readonly string[]): Record<string, unknown> {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    throw new Error('deposit funding substage companion exceeds 16 KiB');
  }
  assertNoDuplicateJsonKeys(text);
  let value: unknown;
  try { value = JSON.parse(text) as unknown; }
  catch { throw new Error('deposit funding substage companion is invalid JSON'); }
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length
    || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new Error('deposit funding substage companion fields differ');
  }
  if (text !== `${canonicalJson(value)}\n`) {
    throw new Error('deposit funding substage companion is not canonical JSON plus one LF');
  }
  return value as Record<string, unknown>;
}

function assertExact(fields: Record<string, unknown>, expected: object): void {
  if (canonicalJson(fields) !== canonicalJson(expected)) {
    throw new Error('deposit funding substage identity, ancestry or digest differs');
  }
}
