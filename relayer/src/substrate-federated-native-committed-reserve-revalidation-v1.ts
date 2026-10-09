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

export const NATIVE_COMMITTED_RESERVE_REVALIDATION_ORIGINS_V1 = Object.freeze([
  'callback-observation-guard', 'revalidator-call',
] as const);
export type NativeCommittedReserveRevalidationOriginV1 =
  typeof NATIVE_COMMITTED_RESERVE_REVALIDATION_ORIGINS_V1[number];

const ORIGINS = new WeakMap<Error, NativeCommittedReserveRevalidationOriginV1>();
const CONFLICTS = new WeakSet<Error>();
const MAX_INSPECTED_VALUES = 64;
const isNativeError = (Error as ErrorConstructor & {
  isError?: (value: unknown) => boolean;
}).isError;

/** Invocation-local classification only; preserve the exact thrown value. */
export function tagNativeCommittedReserveRevalidationOriginV1<T>(
  value: T, origin: NativeCommittedReserveRevalidationOriginV1,
): T {
  const error = asError(value);
  if (error === null) return value;
  if (!isOrigin(origin)) CONFLICTS.add(error);
  else {
    const previous = ORIGINS.get(error);
    if (previous === undefined) ORIGINS.set(error, origin);
    else if (previous !== origin) CONFLICTS.add(error);
  }
  return value;
}

/** Origin must belong to the unique legacy-validated primary operation error. */
export function projectNativeCommittedReserveRevalidationOriginV1(
  value: unknown,
): NativeCommittedReserveRevalidationOriginV1 | null {
  try {
    const legacy = projectSubstrateFederatedNativeCommittedReserveFailureStageV1(value);
    if (legacy?.committedReserveStage !== 'operational-revalidate') return null;
    // Legacy validation checks its aggregate graph before this traversal. An
    // own errors descriptor masked by a different prototype is rejected here,
    // rather than traversing children the legacy projector did not validate.
    const pending = [{ value, cleanupAncestor: false }];
    const seen = new WeakMap<Error, number>();
    let result: NativeCommittedReserveRevalidationOriginV1 | null = null;
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
            !== 'operational-revalidate'
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

const WORKER_SCHEMA = 'e2s.substrate-federated-native-two-cycle-worker-committed-reserve-revalidation.v1';
const PARENT_SCHEMA = 'e2s.substrate-federated-native-two-cycle-parent-committed-reserve-revalidation.v1';
const WORKER_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_COMMITTED_RESERVE_REVALIDATION_V1';
const PARENT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_COMMITTED_RESERVE_REVALIDATION_V1';
const MAX_BYTES = 16 * 1024;
const WORKER_KEYS = [
  'schema', 'version', 'status', 'configSha256Hex', 'expectedBridgeCommit',
  'pathIdentityDigestHex', 'workerFailureReceiptDigestHex',
  'workerRootPhaseV2ReceiptDigestHex', 'workerCycleStepReceiptDigestHex',
  'workerCommittedReserveStageReceiptDigestHex', 'cycle', 'step',
  'committedReserveStage', 'committedReserveKind', 'revalidationOrigin',
  'operationCompletionEstablished', 'rootCleanupEstablished', 'rawCausePublished', 'receiptDigestHex',
] as const;
const PARENT_KEYS = [...WORKER_KEYS, 'failureReceiptDigestHex',
  'parentCycleStepReceiptDigestHex', 'parentCommittedReserveStageReceiptDigestHex',
  'workerRevalidationReceiptDigestHex'] as const;

export interface NativeTwoCycleWorkerCommittedReserveRevalidationLineageV1 {
  readonly workerFailureText: string;
  readonly workerRootPhaseV2Text: string;
  readonly workerCycleStepText: string;
  readonly workerCommittedReserveStageText: string;
}
export interface NativeTwoCycleParentCommittedReserveRevalidationLineageV1
  extends NativeTwoCycleWorkerCommittedReserveRevalidationLineageV1 {
  readonly parentCycleStepText: string;
  readonly parentCommittedReserveStageText: string;
  readonly workerRevalidationText: string;
}
interface RevalidationDetail extends NativeTwoCycleFailureBindingsV1 {
  readonly version: 1;
  readonly workerFailureReceiptDigestHex: string;
  readonly workerRootPhaseV2ReceiptDigestHex: string;
  readonly workerCycleStepReceiptDigestHex: string;
  readonly workerCommittedReserveStageReceiptDigestHex: string;
  readonly cycle: 'cycle-1' | 'cycle-2';
  readonly step: 'committed-reserve';
  readonly committedReserveStage: 'operational-revalidate';
  readonly committedReserveKind: SubstrateFederatedNativeCommittedReserveKindV1;
  readonly revalidationOrigin: NativeCommittedReserveRevalidationOriginV1;
  readonly operationCompletionEstablished: false;
  readonly rootCleanupEstablished: false;
  readonly rawCausePublished: false;
  readonly receiptDigestHex: string;
}
export interface NativeTwoCycleWorkerCommittedReserveRevalidationV1 extends RevalidationDetail {
  readonly schema: typeof WORKER_SCHEMA;
  readonly status: 'committed_reserve_revalidation_failed';
}
export interface NativeTwoCycleParentCommittedReserveRevalidationV1 extends RevalidationDetail {
  readonly schema: typeof PARENT_SCHEMA;
  readonly status: 'committed_reserve_revalidation_diagnostics_validated';
  readonly failureReceiptDigestHex: string;
  readonly parentCycleStepReceiptDigestHex: string;
  readonly parentCommittedReserveStageReceiptDigestHex: string;
  readonly workerRevalidationReceiptDigestHex: string;
}

/** Closed diagnostic assertion bound to the fully parsed legacy worker. */
export function createNativeTwoCycleWorkerCommittedReserveRevalidationV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  lineage: Readonly<NativeTwoCycleWorkerCommittedReserveRevalidationLineageV1>,
  origin: NativeCommittedReserveRevalidationOriginV1,
): Readonly<NativeTwoCycleWorkerCommittedReserveRevalidationV1> {
  const worker = parseNativeTwoCycleWorkerCommittedReserveStageV1(
    lineage.workerCommittedReserveStageText, bindings, lineage.workerFailureText,
    lineage.workerRootPhaseV2Text, lineage.workerCycleStepText);
  const body = Object.freeze({ schema: WORKER_SCHEMA, version: 1 as const,
    status: 'committed_reserve_revalidation_failed' as const,
    ...detail(worker, validateOrigin(origin)),
  });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, WORKER_DOMAIN) });
}

export function parseNativeTwoCycleWorkerCommittedReserveRevalidationV1(
  text: string, bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  lineage: Readonly<NativeTwoCycleWorkerCommittedReserveRevalidationLineageV1>,
): Readonly<NativeTwoCycleWorkerCommittedReserveRevalidationV1> {
  const fields = exactRecord(parseText(text), WORKER_KEYS);
  const expected = createNativeTwoCycleWorkerCommittedReserveRevalidationV1(
    bindings, lineage, validateOrigin(fields.revalidationOrigin));
  assertExact(fields, expected);
  return expected;
}

/** Bind the exact legacy parent, new worker and terminal digest; confer no authority. */
export function createNativeTwoCycleParentCommittedReserveRevalidationV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>, failureReceiptDigestHex: string,
  lineage: Readonly<NativeTwoCycleParentCommittedReserveRevalidationLineageV1>,
): Readonly<NativeTwoCycleParentCommittedReserveRevalidationV1> {
  const parent = parseNativeTwoCycleParentCommittedReserveStageV1(
    lineage.parentCommittedReserveStageText, bindings, failureReceiptDigestHex,
    lineage.workerFailureText, lineage.workerRootPhaseV2Text, lineage.workerCycleStepText,
    lineage.workerCommittedReserveStageText, lineage.parentCycleStepText);
  const worker = parseNativeTwoCycleWorkerCommittedReserveRevalidationV1(
    lineage.workerRevalidationText, bindings, lineage);
  if (parent.committedReserveStage !== 'operational-revalidate'
    || parent.cycle !== worker.cycle || parent.committedReserveKind !== worker.committedReserveKind
    || parent.workerCommittedReserveStageReceiptDigestHex
      !== worker.workerCommittedReserveStageReceiptDigestHex) {
    throw new Error('native committed reserve revalidation parent ancestry differs');
  }
  const { schema: ignoredSchema, status: ignoredStatus, receiptDigestHex: ignoredDigest,
    ...workerBody } = worker;
  void ignoredSchema; void ignoredStatus; void ignoredDigest;
  const body = Object.freeze({ schema: PARENT_SCHEMA,
    status: 'committed_reserve_revalidation_diagnostics_validated' as const,
    ...workerBody, failureReceiptDigestHex: parent.failureReceiptDigestHex,
    parentCycleStepReceiptDigestHex: parent.parentCycleStepReceiptDigestHex,
    parentCommittedReserveStageReceiptDigestHex: parent.receiptDigestHex,
    workerRevalidationReceiptDigestHex: worker.receiptDigestHex,
  });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, PARENT_DOMAIN) });
}

export function parseNativeTwoCycleParentCommittedReserveRevalidationV1(
  text: string, bindings: Readonly<NativeTwoCycleFailureBindingsV1>, failureReceiptDigestHex: string,
  lineage: Readonly<NativeTwoCycleParentCommittedReserveRevalidationLineageV1>,
): Readonly<NativeTwoCycleParentCommittedReserveRevalidationV1> {
  const fields = exactRecord(parseText(text), PARENT_KEYS);
  const expected = createNativeTwoCycleParentCommittedReserveRevalidationV1(
    bindings, failureReceiptDigestHex, lineage);
  assertExact(fields, expected);
  return expected;
}

function detail(worker: Readonly<NativeTwoCycleWorkerCommittedReserveStageV1>,
  origin: NativeCommittedReserveRevalidationOriginV1) {
  if (worker.committedReserveStage !== 'operational-revalidate') {
    throw new Error('native committed reserve revalidation requires operational-revalidate');
  }
  return {
    configSha256Hex: worker.configSha256Hex, expectedBridgeCommit: worker.expectedBridgeCommit,
    pathIdentityDigestHex: worker.pathIdentityDigestHex,
    workerFailureReceiptDigestHex: worker.workerFailureReceiptDigestHex,
    workerRootPhaseV2ReceiptDigestHex: worker.workerRootPhaseV2ReceiptDigestHex,
    workerCycleStepReceiptDigestHex: worker.workerCycleStepReceiptDigestHex,
    workerCommittedReserveStageReceiptDigestHex: worker.receiptDigestHex,
    cycle: worker.cycle, step: worker.step, committedReserveStage: 'operational-revalidate' as const,
    committedReserveKind: worker.committedReserveKind, revalidationOrigin: origin,
    operationCompletionEstablished: false as const, rootCleanupEstablished: false as const,
    rawCausePublished: false as const,
  };
}

function asError(value: unknown): Error | null {
  try { return isNativeError?.(value) === true ? value as Error : null; }
  catch { return null; }
}
function isOrigin(value: unknown): value is NativeCommittedReserveRevalidationOriginV1 {
  return value === 'callback-observation-guard' || value === 'revalidator-call';
}
function validateOrigin(value: unknown): NativeCommittedReserveRevalidationOriginV1 {
  if (!isOrigin(value)) throw new Error('native committed reserve revalidation origin is unsupported');
  return value;
}
function parseText(text: string): unknown {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    throw new Error('native committed reserve revalidation companion is not bounded text');
  }
  assertNoDuplicateJsonKeys(text);
  let value: unknown;
  try { value = JSON.parse(text) as unknown; }
  catch { throw new Error('native committed reserve revalidation companion is invalid JSON'); }
  if (text !== `${canonicalJson(value)}\n`) {
    throw new Error('native committed reserve revalidation companion is not canonical JSON');
  }
  return value;
}
function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('native committed reserve revalidation companion must be an object');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length
    || keys.some(key => !Object.prototype.hasOwnProperty.call(record, key))) {
    throw new Error('native committed reserve revalidation companion fields differ');
  }
  return record;
}
function assertExact(fields: Record<string, unknown>, expected: RevalidationDetail): void {
  if (canonicalJson(fields) !== canonicalJson(expected)) {
    throw new Error('native committed reserve revalidation identity, claims, lineage or digest differ');
  }
}
