import { assertNoDuplicateJsonKeys, canonicalJson, sha256CanonicalJson }
  from './ergo-settlement-core/strict-json.js';
import { projectOwnNativeTwoCycleCycleStepFailureV1 }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';
import { projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 }
  from './substrate-federated-native-two-cycle-root-phase-v1.js';
import { type NativeTwoCycleFailureBindingsV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import {
  projectSubstrateFederatedNativeCommittedReserveFailureStageV1,
  projectOwnSubstrateFederatedNativeCommittedReserveFailureStageV1,
  projectOwnSubstrateFederatedNativeCommittedReserveKindV1,
  parseNativeTwoCycleWorkerCommittedReserveStageV1,
  parseNativeTwoCycleParentCommittedReserveStageV1,
  type NativeTwoCycleWorkerCommittedReserveStageV1,
  type SubstrateFederatedNativeCommittedReserveKindV1,
} from './substrate-federated-native-committed-reserve-failure-v1.js';

export const NATIVE_COMMITTED_RESERVE_CONFIRMATION_ORIGINS_V1 = Object.freeze([
  'active-guard', 'confirmation-observation',
] as const);
export type NativeCommittedReserveConfirmationOriginV1 =
  typeof NATIVE_COMMITTED_RESERVE_CONFIRMATION_ORIGINS_V1[number];

export const NATIVE_COMMITTED_RESERVE_CONFIRMATION_CATEGORIES_V1 = Object.freeze([
  'managed_deadline_elapsed', 'confirmation_budget_elapsed', 'clock_failure', 'observer_failure',
  'pending_at_deadline', 'not_found_at_deadline', 'observation_completed_after_deadline',
] as const);
export type NativeCommittedReserveConfirmationCategoryV1 =
  typeof NATIVE_COMMITTED_RESERVE_CONFIRMATION_CATEGORIES_V1[number];
export type NativeCommittedReserveConfirmationProjectionV1 =
  | Readonly<{ confirmationOrigin: 'active-guard'; confirmationCategory: null }>
  | Readonly<{ confirmationOrigin: 'confirmation-observation';
      confirmationCategory: NativeCommittedReserveConfirmationCategoryV1 }>;

const ORIGINS = new WeakMap<Error, NativeCommittedReserveConfirmationProjectionV1>();
const CONFLICTS = new WeakSet<Error>();
const MAX_INSPECTED_VALUES = 64;
const isNativeError = (Error as ErrorConstructor & {
  isError?: (value: unknown) => boolean;
}).isError;

/** Invocation-local classification only; preserve the exact thrown value. */
export function tagNativeCommittedReserveConfirmationOriginV1<T>(
  value: T, origin: NativeCommittedReserveConfirmationOriginV1,
  category: NativeCommittedReserveConfirmationCategoryV1 | null = null,
): T {
  const error = asError(value);
  if (error === null) return value;
  if (!isDetail(origin, category)) CONFLICTS.add(error);
  else {
    const previous = ORIGINS.get(error);
    if (previous === undefined) ORIGINS.set(error, Object.freeze({
      confirmationOrigin: origin, confirmationCategory: category,
    }) as NativeCommittedReserveConfirmationProjectionV1);
    else if (previous.confirmationOrigin !== origin || previous.confirmationCategory !== category) {
      CONFLICTS.add(error);
    }
  }
  return value;
}

/** Origin must belong to the unique legacy-validated primary operation error. */
export function projectNativeCommittedReserveConfirmationOriginV1(
  value: unknown,
): NativeCommittedReserveConfirmationProjectionV1 | null {
  try {
    const legacy = projectSubstrateFederatedNativeCommittedReserveFailureStageV1(value);
    if (legacy?.committedReserveStage !== 'confirmation') return null;
    // Legacy validation checks its aggregate graph before this traversal. An
    // own errors descriptor masked by a different prototype is rejected here,
    // rather than traversing children the legacy projector did not validate.
    const pending = [{ value, cleanupAncestor: false }];
    const seen = new WeakMap<Error, number>();
    let result: NativeCommittedReserveConfirmationProjectionV1 | null = null;
    let tagged = 0;
    let inspected = 0;
    while (pending.length > 0) {
      if (++inspected > MAX_INSPECTED_VALUES) return null;
      const next = pending.pop()!;
      const current = asError(next.value);
      if (current === null || CONFLICTS.has(current)) return null;
      const childrenDescriptor = Object.getOwnPropertyDescriptor(current, 'errors');
      const aggregate = current instanceof AggregateError;
      if (childrenDescriptor !== undefined && !aggregate) return null;
      const root = projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(current);
      const cleanupAncestor = next.cleanupAncestor || root === 'cleanup';
      const context = cleanupAncestor ? 2 : 1;
      const previous = seen.get(current) ?? 0;
      if ((previous & context) !== 0) continue;
      seen.set(current, previous | context);
      const origin = ORIGINS.get(current);
      if (origin !== undefined) {
        const step = projectOwnNativeTwoCycleCycleStepFailureV1(current);
        if (++tagged > 1 || cleanupAncestor
          || projectOwnSubstrateFederatedNativeCommittedReserveFailureStageV1(current)
            !== 'confirmation'
          || projectOwnSubstrateFederatedNativeCommittedReserveKindV1(current)
            !== legacy.committedReserveKind
          || step?.step !== 'committed-reserve' || root !== step.cycle) return null;
        result = origin;
      }
      if (aggregate) {
        if (childrenDescriptor === undefined || !('value' in childrenDescriptor)) return null;
        const children: unknown = childrenDescriptor.value;
        if (!Array.isArray(children)) return null;
        const length: unknown = Object.getOwnPropertyDescriptor(children, 'length')?.value;
        if (!Number.isSafeInteger(length) || (length as number) < 0
          || (length as number) > MAX_INSPECTED_VALUES - inspected) return null;
        for (let index = 0; index < (length as number); index++) {
          const child = Object.getOwnPropertyDescriptor(children, String(index));
          if (child === undefined || !('value' in child)) return null;
          pending.push({ value: child.value, cleanupAncestor });
        }
      }
    }
    return result;
  } catch { return null; }
}

const WORKER_SCHEMA = 'e2s.substrate-federated-native-two-cycle-worker-committed-reserve-confirmation.v1';
const PARENT_SCHEMA = 'e2s.substrate-federated-native-two-cycle-parent-committed-reserve-confirmation.v1';
const WORKER_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_COMMITTED_RESERVE_CONFIRMATION_V1';
const PARENT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_COMMITTED_RESERVE_CONFIRMATION_V1';
const MAX_BYTES = 16 * 1024;
const WORKER_KEYS = [
  'schema', 'version', 'status', 'configSha256Hex', 'expectedBridgeCommit',
  'pathIdentityDigestHex', 'workerFailureReceiptDigestHex',
  'workerRootPhaseV2ReceiptDigestHex', 'workerCycleStepReceiptDigestHex',
  'workerCommittedReserveStageReceiptDigestHex', 'cycle', 'step',
  'committedReserveStage', 'committedReserveKind', 'confirmationOrigin', 'confirmationCategory',
  'operationCompletionEstablished', 'rootCleanupEstablished', 'rawCausePublished', 'receiptDigestHex',
] as const;
const PARENT_KEYS = [...WORKER_KEYS, 'failureReceiptDigestHex',
  'parentCycleStepReceiptDigestHex', 'parentCommittedReserveStageReceiptDigestHex',
  'workerConfirmationReceiptDigestHex'] as const;

export interface NativeTwoCycleWorkerCommittedReserveConfirmationLineageV1 {
  readonly workerFailureText: string;
  readonly workerRootPhaseV2Text: string;
  readonly workerCycleStepText: string;
  readonly workerCommittedReserveStageText: string;
}
export interface NativeTwoCycleParentCommittedReserveConfirmationLineageV1
  extends NativeTwoCycleWorkerCommittedReserveConfirmationLineageV1 {
  readonly parentCycleStepText: string;
  readonly parentCommittedReserveStageText: string;
  readonly workerConfirmationText: string;
}
interface ConfirmationDetail extends NativeTwoCycleFailureBindingsV1 {
  readonly version: 1;
  readonly workerFailureReceiptDigestHex: string;
  readonly workerRootPhaseV2ReceiptDigestHex: string;
  readonly workerCycleStepReceiptDigestHex: string;
  readonly workerCommittedReserveStageReceiptDigestHex: string;
  readonly cycle: 'cycle-1' | 'cycle-2';
  readonly step: 'committed-reserve';
  readonly committedReserveStage: 'confirmation';
  readonly committedReserveKind: SubstrateFederatedNativeCommittedReserveKindV1;
  readonly confirmationOrigin: NativeCommittedReserveConfirmationOriginV1;
  readonly confirmationCategory: NativeCommittedReserveConfirmationCategoryV1 | null;
  readonly operationCompletionEstablished: false;
  readonly rootCleanupEstablished: false;
  readonly rawCausePublished: false;
  readonly receiptDigestHex: string;
}
export interface NativeTwoCycleWorkerCommittedReserveConfirmationV1 extends ConfirmationDetail {
  readonly schema: typeof WORKER_SCHEMA;
  readonly status: 'committed_reserve_confirmation_failed';
}
export interface NativeTwoCycleParentCommittedReserveConfirmationV1 extends ConfirmationDetail {
  readonly schema: typeof PARENT_SCHEMA;
  readonly status: 'committed_reserve_confirmation_diagnostics_validated';
  readonly failureReceiptDigestHex: string;
  readonly parentCycleStepReceiptDigestHex: string;
  readonly parentCommittedReserveStageReceiptDigestHex: string;
  readonly workerConfirmationReceiptDigestHex: string;
}

/** Closed diagnostic assertion bound to the fully parsed legacy worker. */
export function createNativeTwoCycleWorkerCommittedReserveConfirmationV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  lineage: Readonly<NativeTwoCycleWorkerCommittedReserveConfirmationLineageV1>,
  projection: Readonly<NativeCommittedReserveConfirmationProjectionV1>,
): Readonly<NativeTwoCycleWorkerCommittedReserveConfirmationV1> {
  const worker = parseNativeTwoCycleWorkerCommittedReserveStageV1(
    lineage.workerCommittedReserveStageText, bindings, lineage.workerFailureText,
    lineage.workerRootPhaseV2Text, lineage.workerCycleStepText);
  const body = Object.freeze({ schema: WORKER_SCHEMA, version: 1 as const,
    status: 'committed_reserve_confirmation_failed' as const,
    ...detail(worker, validateProjection(projection)),
  });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, WORKER_DOMAIN) });
}

export function parseNativeTwoCycleWorkerCommittedReserveConfirmationV1(
  text: string, bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  lineage: Readonly<NativeTwoCycleWorkerCommittedReserveConfirmationLineageV1>,
): Readonly<NativeTwoCycleWorkerCommittedReserveConfirmationV1> {
  const fields = exactRecord(parseText(text), WORKER_KEYS);
  const expected = createNativeTwoCycleWorkerCommittedReserveConfirmationV1(
    bindings, lineage, validateDetail(fields.confirmationOrigin, fields.confirmationCategory));
  assertExact(fields, expected);
  return expected;
}

/** Bind the exact legacy parent, new worker and terminal digest; confer no authority. */
export function createNativeTwoCycleParentCommittedReserveConfirmationV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>, failureReceiptDigestHex: string,
  lineage: Readonly<NativeTwoCycleParentCommittedReserveConfirmationLineageV1>,
): Readonly<NativeTwoCycleParentCommittedReserveConfirmationV1> {
  const parent = parseNativeTwoCycleParentCommittedReserveStageV1(
    lineage.parentCommittedReserveStageText, bindings, failureReceiptDigestHex,
    lineage.workerFailureText, lineage.workerRootPhaseV2Text, lineage.workerCycleStepText,
    lineage.workerCommittedReserveStageText, lineage.parentCycleStepText);
  const worker = parseNativeTwoCycleWorkerCommittedReserveConfirmationV1(
    lineage.workerConfirmationText, bindings, lineage);
  if (parent.committedReserveStage !== 'confirmation'
    || parent.cycle !== worker.cycle || parent.committedReserveKind !== worker.committedReserveKind
    || parent.workerCommittedReserveStageReceiptDigestHex
      !== worker.workerCommittedReserveStageReceiptDigestHex) {
    throw new Error('native committed reserve confirmation parent ancestry differs');
  }
  const { schema: ignoredSchema, status: ignoredStatus, receiptDigestHex: ignoredDigest,
    ...workerBody } = worker;
  void ignoredSchema; void ignoredStatus; void ignoredDigest;
  const body = Object.freeze({ schema: PARENT_SCHEMA,
    status: 'committed_reserve_confirmation_diagnostics_validated' as const,
    ...workerBody, failureReceiptDigestHex: parent.failureReceiptDigestHex,
    parentCycleStepReceiptDigestHex: parent.parentCycleStepReceiptDigestHex,
    parentCommittedReserveStageReceiptDigestHex: parent.receiptDigestHex,
    workerConfirmationReceiptDigestHex: worker.receiptDigestHex,
  });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, PARENT_DOMAIN) });
}

export function parseNativeTwoCycleParentCommittedReserveConfirmationV1(
  text: string, bindings: Readonly<NativeTwoCycleFailureBindingsV1>, failureReceiptDigestHex: string,
  lineage: Readonly<NativeTwoCycleParentCommittedReserveConfirmationLineageV1>,
): Readonly<NativeTwoCycleParentCommittedReserveConfirmationV1> {
  const fields = exactRecord(parseText(text), PARENT_KEYS);
  const expected = createNativeTwoCycleParentCommittedReserveConfirmationV1(
    bindings, failureReceiptDigestHex, lineage);
  assertExact(fields, expected);
  return expected;
}

function detail(worker: Readonly<NativeTwoCycleWorkerCommittedReserveStageV1>,
  projection: Readonly<NativeCommittedReserveConfirmationProjectionV1>) {
  if (worker.committedReserveStage !== 'confirmation') {
    throw new Error('native committed reserve confirmation requires confirmation');
  }
  return {
    configSha256Hex: worker.configSha256Hex, expectedBridgeCommit: worker.expectedBridgeCommit,
    pathIdentityDigestHex: worker.pathIdentityDigestHex,
    workerFailureReceiptDigestHex: worker.workerFailureReceiptDigestHex,
    workerRootPhaseV2ReceiptDigestHex: worker.workerRootPhaseV2ReceiptDigestHex,
    workerCycleStepReceiptDigestHex: worker.workerCycleStepReceiptDigestHex,
    workerCommittedReserveStageReceiptDigestHex: worker.receiptDigestHex,
    cycle: worker.cycle, step: worker.step, committedReserveStage: 'confirmation' as const,
    committedReserveKind: worker.committedReserveKind, ...projection,
    operationCompletionEstablished: false as const, rootCleanupEstablished: false as const,
    rawCausePublished: false as const,
  };
}

function asError(value: unknown): Error | null {
  try { return isNativeError?.(value) === true ? value as Error : null; }
  catch { return null; }
}
function isDetail(origin: unknown, category: unknown): boolean {
  return (origin === 'active-guard' && category === null)
    || (origin === 'confirmation-observation' && typeof category === 'string'
      && NATIVE_COMMITTED_RESERVE_CONFIRMATION_CATEGORIES_V1.includes(
        category as NativeCommittedReserveConfirmationCategoryV1));
}
function validateDetail(origin: unknown, category: unknown): NativeCommittedReserveConfirmationProjectionV1 {
  if (!isDetail(origin, category)) {
    throw new Error('native committed reserve confirmation origin or category is unsupported');
  }
  return Object.freeze({ confirmationOrigin: origin, confirmationCategory: category }) as
    NativeCommittedReserveConfirmationProjectionV1;
}
function validateProjection(value: unknown): NativeCommittedReserveConfirmationProjectionV1 {
  const fields = exactRecord(value, ['confirmationOrigin', 'confirmationCategory']);
  const origin = Object.getOwnPropertyDescriptor(fields, 'confirmationOrigin');
  const category = Object.getOwnPropertyDescriptor(fields, 'confirmationCategory');
  if (origin === undefined || !('value' in origin) || category === undefined || !('value' in category)) {
    throw new Error('native committed reserve confirmation detail must use own data fields');
  }
  return validateDetail(origin.value, category.value);
}
function parseText(text: string): unknown {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    throw new Error('native committed reserve confirmation companion is not bounded text');
  }
  assertNoDuplicateJsonKeys(text);
  let value: unknown;
  try { value = JSON.parse(text) as unknown; }
  catch { throw new Error('native committed reserve confirmation companion is invalid JSON'); }
  if (text !== `${canonicalJson(value)}\n`) {
    throw new Error('native committed reserve confirmation companion is not canonical JSON');
  }
  return value;
}
function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('native committed reserve confirmation companion must be an object');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length
    || keys.some(key => !Object.prototype.hasOwnProperty.call(record, key))) {
    throw new Error('native committed reserve confirmation companion fields differ');
  }
  return record;
}
function assertExact(fields: Record<string, unknown>, expected: ConfirmationDetail): void {
  if (canonicalJson(fields) !== canonicalJson(expected)) {
    throw new Error('native committed reserve confirmation identity, claims, lineage or digest differ');
  }
}
