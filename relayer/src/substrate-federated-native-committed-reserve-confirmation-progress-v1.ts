import { types } from 'node:util';
import { assertNoDuplicateJsonKeys, canonicalJson, sha256CanonicalJson }
  from './ergo-settlement-core/strict-json.js';
import { type SubstrateFederatedIsolatedDevnetConfirmationProgressV1 }
  from './substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';
import {
  projectNativeCommittedReserveConfirmationOriginV1,
  parseNativeTwoCycleWorkerCommittedReserveConfirmationV1,
  parseNativeTwoCycleParentCommittedReserveConfirmationV1,
  type NativeTwoCycleWorkerCommittedReserveConfirmationLineageV1,
  type NativeTwoCycleParentCommittedReserveConfirmationLineageV1,
  type NativeTwoCycleWorkerCommittedReserveConfirmationV1,
  type NativeTwoCycleParentCommittedReserveConfirmationV1,
  NATIVE_COMMITTED_RESERVE_CONFIRMATION_CATEGORIES_V1,
  type NativeCommittedReserveConfirmationCategoryV1,
} from './substrate-federated-native-committed-reserve-confirmation-v1.js';
import { type NativeTwoCycleFailureBindingsV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { projectOwnNativeTwoCycleCycleStepFailureV1 }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';
import { projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 }
  from './substrate-federated-native-two-cycle-root-phase-v1.js';
import {
  projectOwnSubstrateFederatedNativeCommittedReserveFailureStageV1,
  projectOwnSubstrateFederatedNativeCommittedReserveKindV1,
} from './substrate-federated-native-committed-reserve-failure-v1.js';

export interface NativeCommittedReserveConfirmationProgressDetailV1 {
  readonly confirmationCategory: NativeCommittedReserveConfirmationCategoryV1;
  readonly progress: Readonly<SubstrateFederatedIsolatedDevnetConfirmationProgressV1>;
  readonly expectedTransactionIdHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly targetGenesisHeaderIdHex: string;
  readonly observationCount: number;
  readonly lastObservationDigestHex: string;
  readonly lastObservationHeight: number;
}

const DETAILS = new WeakMap<Error, Readonly<NativeCommittedReserveConfirmationProgressDetailV1>>();
const CONFLICTS = new WeakSet<Error>();
const MAX_INSPECTED_VALUES = 64;
const MAX_BYTES = 16 * 1024;
const PROGRESS_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CONFIRMATION_PROGRESS_V1';
const WORKER_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_COMMITTED_RESERVE_CONFIRMATION_PROGRESS_V1';
const PARENT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_COMMITTED_RESERVE_CONFIRMATION_PROGRESS_V1';
const WORKER_SCHEMA = 'e2s.substrate-federated-native-two-cycle-worker-committed-reserve-confirmation-progress.v1';
const PARENT_SCHEMA = 'e2s.substrate-federated-native-two-cycle-parent-committed-reserve-confirmation-progress.v1';
const isNativeError = (Error as ErrorConstructor & { isError?: (value: unknown) => boolean }).isError;
const DETAIL_KEYS = ['confirmationCategory', 'progress', 'expectedTransactionIdHex', 'executionTargetIdentityDigestHex',
  'targetGenesisHeaderIdHex', 'observationCount', 'lastObservationDigestHex', 'lastObservationHeight'];
const WORKER_KEYS = ['schema', 'version', 'status', 'configSha256Hex', 'expectedBridgeCommit',
  'pathIdentityDigestHex', 'workerFailureReceiptDigestHex', 'workerRootPhaseV2ReceiptDigestHex',
  'workerCycleStepReceiptDigestHex', 'workerCommittedReserveStageReceiptDigestHex', 'cycle', 'step',
  'committedReserveStage', 'committedReserveKind', 'confirmationOrigin', 'confirmationCategory',
  'operationCompletionEstablished', 'rootCleanupEstablished', 'rawCausePublished', 'receiptDigestHex',
  'confirmationProgress', 'workerConfirmationReceiptDigestHex'];
const PARENT_KEYS = [...WORKER_KEYS, 'failureReceiptDigestHex', 'parentCycleStepReceiptDigestHex',
  'parentCommittedReserveStageReceiptDigestHex', 'parentConfirmationReceiptDigestHex',
  'workerProgressReceiptDigestHex'];

/** Private, invocation-local diagnostics; tagging never replaces the thrown value. */
export function tagNativeCommittedReserveConfirmationProgressV1<T>(value: T,
  detail: Readonly<NativeCommittedReserveConfirmationProgressDetailV1>): T {
  const error = asError(value);
  if (error === null) return value;
  try {
    const validated = validateDetail(detail);
    const previous = DETAILS.get(error);
    if (previous === undefined) DETAILS.set(error, validated);
    else if (canonicalJson(previous) !== canonicalJson(validated)) CONFLICTS.add(error);
  } catch { CONFLICTS.add(error); }
  return value;
}

/** Require the unique legacy-validated native confirmation primary, never its cleanup. */
export function projectNativeCommittedReserveConfirmationProgressV1(value: unknown):
  Readonly<NativeCommittedReserveConfirmationProgressDetailV1> | null {
  try {
    const legacy = projectNativeCommittedReserveConfirmationOriginV1(value);
    if (legacy?.confirmationOrigin !== 'confirmation-observation') return null;
    const pending = [{ value, cleanupAncestor: false }];
    const seen = new WeakMap<Error, number>();
    let result: Readonly<NativeCommittedReserveConfirmationProgressDetailV1> | null = null;
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
      const detail = DETAILS.get(current);
      if (detail !== undefined) {
        const step = projectOwnNativeTwoCycleCycleStepFailureV1(current);
        if (++tagged > 1 || cleanupAncestor || detail.confirmationCategory !== legacy.confirmationCategory
          || root !== step?.cycle
          || step?.step !== 'committed-reserve'
          || projectOwnSubstrateFederatedNativeCommittedReserveFailureStageV1(current) !== 'confirmation'
          || projectOwnSubstrateFederatedNativeCommittedReserveKindV1(current) === null
          || projectNativeCommittedReserveConfirmationOriginV1(current)?.confirmationOrigin
            !== 'confirmation-observation') return null;
        result = detail;
      }
      if (aggregate) {
        if (childrenDescriptor === undefined || !('value' in childrenDescriptor)) return null;
        const children: unknown = childrenDescriptor.value;
        if (!Array.isArray(children) || types.isProxy(children)) return null;
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

export interface NativeTwoCycleWorkerCommittedReserveConfirmationProgressLineageV1
  extends NativeTwoCycleWorkerCommittedReserveConfirmationLineageV1 {
  readonly workerConfirmationText: string;
}
export interface NativeTwoCycleParentCommittedReserveConfirmationProgressLineageV1
  extends NativeTwoCycleParentCommittedReserveConfirmationLineageV1 {
  readonly workerProgressText: string;
  readonly parentConfirmationText: string;
}
export interface NativeTwoCycleWorkerCommittedReserveConfirmationProgressV1
  extends Omit<NativeTwoCycleWorkerCommittedReserveConfirmationV1, 'schema' | 'status'> {
  readonly schema: typeof WORKER_SCHEMA;
  readonly status: 'committed_reserve_confirmation_progress_failed';
  readonly confirmationProgress: Readonly<NativeCommittedReserveConfirmationProgressDetailV1>;
  readonly workerConfirmationReceiptDigestHex: string;
}
export interface NativeTwoCycleParentCommittedReserveConfirmationProgressV1
  extends Omit<NativeTwoCycleParentCommittedReserveConfirmationV1, 'schema' | 'status'> {
  readonly schema: typeof PARENT_SCHEMA;
  readonly status: 'committed_reserve_confirmation_progress_diagnostics_validated';
  readonly confirmationProgress: Readonly<NativeCommittedReserveConfirmationProgressDetailV1>;
  readonly parentConfirmationReceiptDigestHex: string;
  readonly workerProgressReceiptDigestHex: string;
}

export function createNativeTwoCycleWorkerCommittedReserveConfirmationProgressV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  lineage: Readonly<NativeTwoCycleWorkerCommittedReserveConfirmationProgressLineageV1>,
  detail: Readonly<NativeCommittedReserveConfirmationProgressDetailV1>,
): Readonly<NativeTwoCycleWorkerCommittedReserveConfirmationProgressV1> {
  const worker = parseNativeTwoCycleWorkerCommittedReserveConfirmationV1(
    lineage.workerConfirmationText, bindings, lineage);
  const validated = validateDetail(detail);
  if (worker.confirmationOrigin !== 'confirmation-observation'
    || worker.confirmationCategory !== validated.confirmationCategory) fail();
  const { schema, status, receiptDigestHex, ...oldBody } = worker;
  void schema; void status;
  const body = Object.freeze({ ...oldBody, schema: WORKER_SCHEMA,
    status: 'committed_reserve_confirmation_progress_failed' as const,
    confirmationProgress: validated, workerConfirmationReceiptDigestHex: receiptDigestHex });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, WORKER_DOMAIN) });
}

export function parseNativeTwoCycleWorkerCommittedReserveConfirmationProgressV1(text: string,
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  lineage: Readonly<NativeTwoCycleWorkerCommittedReserveConfirmationProgressLineageV1>,
): Readonly<NativeTwoCycleWorkerCommittedReserveConfirmationProgressV1> {
  const fields = exactRecord(parseText(text), WORKER_KEYS);
  const expected = createNativeTwoCycleWorkerCommittedReserveConfirmationProgressV1(
    bindings, lineage, validateDetail(fields.confirmationProgress));
  assertExact(fields, expected);
  return expected;
}

export function createNativeTwoCycleParentCommittedReserveConfirmationProgressV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>, failureReceiptDigestHex: string,
  lineage: Readonly<NativeTwoCycleParentCommittedReserveConfirmationProgressLineageV1>,
): Readonly<NativeTwoCycleParentCommittedReserveConfirmationProgressV1> {
  const parent = parseNativeTwoCycleParentCommittedReserveConfirmationV1(
    lineage.parentConfirmationText, bindings, failureReceiptDigestHex, lineage);
  const worker = parseNativeTwoCycleWorkerCommittedReserveConfirmationProgressV1(
    lineage.workerProgressText, bindings, lineage);
  const { schema: workerSchema, status: workerStatus, receiptDigestHex: workerDigest,
    confirmationProgress, workerConfirmationReceiptDigestHex, ...workerOld } = worker;
  const { schema: parentSchema, status: parentStatus, receiptDigestHex: parentDigest,
    failureReceiptDigestHex: terminal, parentCycleStepReceiptDigestHex,
    parentCommittedReserveStageReceiptDigestHex, workerConfirmationReceiptDigestHex: oldWorkerDigest,
    ...parentOld } = parent;
  void workerSchema; void workerStatus; void parentSchema; void parentStatus;
  if (workerConfirmationReceiptDigestHex !== oldWorkerDigest
    || canonicalJson(workerOld) !== canonicalJson(parentOld)) fail();
  const body = Object.freeze({ ...parentOld, schema: PARENT_SCHEMA,
    status: 'committed_reserve_confirmation_progress_diagnostics_validated' as const,
    failureReceiptDigestHex: terminal, parentCycleStepReceiptDigestHex,
    parentCommittedReserveStageReceiptDigestHex, workerConfirmationReceiptDigestHex,
    confirmationProgress, parentConfirmationReceiptDigestHex: parentDigest,
    workerProgressReceiptDigestHex: workerDigest });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, PARENT_DOMAIN) });
}

export function parseNativeTwoCycleParentCommittedReserveConfirmationProgressV1(text: string,
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>, failureReceiptDigestHex: string,
  lineage: Readonly<NativeTwoCycleParentCommittedReserveConfirmationProgressLineageV1>,
): Readonly<NativeTwoCycleParentCommittedReserveConfirmationProgressV1> {
  const fields = exactRecord(parseText(text), PARENT_KEYS);
  const expected = createNativeTwoCycleParentCommittedReserveConfirmationProgressV1(
    bindings, failureReceiptDigestHex, lineage);
  assertExact(fields, expected);
  return expected;
}

function validateDetail(value: unknown): Readonly<NativeCommittedReserveConfirmationProgressDetailV1> {
  const fields = exactRecord(value, DETAIL_KEYS);
  if (typeof fields.confirmationCategory !== 'string'
    || !NATIVE_COMMITTED_RESERVE_CONFIRMATION_CATEGORIES_V1.includes(
      fields.confirmationCategory as NativeCommittedReserveConfirmationCategoryV1)) fail();
  const progressFields = exactRecord(fields.progress, ['schema', 'version',
    'expectedErgoTransactionIdHex', 'executionTargetIdentityDigestHex', 'targetGenesisHeaderIdHex',
    'observationSequence', 'observedAtUnixMs', 'primary', 'witness', 'diagnosticDigestHex']);
  for (const key of ['expectedTransactionIdHex', 'executionTargetIdentityDigestHex',
    'targetGenesisHeaderIdHex', 'lastObservationDigestHex']) hex(fields[key]);
  integer(fields.observationCount, 1); integer(fields.lastObservationHeight, 1, 0x7fffffff);
  if (progressFields.schema !== 'e2s.substrate-federated-isolated-devnet-confirmation-progress.v1'
    || progressFields.version !== 1
    || progressFields.expectedErgoTransactionIdHex !== fields.expectedTransactionIdHex
    || progressFields.executionTargetIdentityDigestHex !== fields.executionTargetIdentityDigestHex
    || progressFields.targetGenesisHeaderIdHex !== fields.targetGenesisHeaderIdHex
    || progressFields.observationSequence !== fields.observationCount) fail();
  integer(progressFields.observedAtUnixMs, 0); hex(progressFields.diagnosticDigestHex);
  const primary = validateNode(progressFields.primary);
  const witness = validateNode(progressFields.witness);
  if (Math.min(primary.fullHeightAfter, witness.fullHeightAfter) !== fields.lastObservationHeight) fail();
  const { diagnosticDigestHex, ...progressBody } = progressFields;
  const body = { ...progressBody, primary, witness };
  const payload = { ...body, diagnosticDigestHex };
  if (sha256CanonicalJson(body, PROGRESS_DOMAIN) !== diagnosticDigestHex) fail();
  return Object.freeze({ ...fields, progress: Object.freeze(payload) }) as unknown as
    Readonly<NativeCommittedReserveConfirmationProgressDetailV1>;
}

function validateNode(value: unknown) {
  const node = exactRecord(value, ['fullHeightBefore', 'fullHeightAfter', 'index', 'pool']);
  const before = integer(node.fullHeightBefore, 1, 0x7fffffff);
  const after = integer(node.fullHeightAfter, before, 0x7fffffff);
  const indexFields = ownRecord(node.index);
  let index: Record<string, unknown>;
  if (indexFields.status === 'observed') {
    index = exactRecord(node.index, ['status', 'indexedHeight', 'fullHeight']);
    const full = integer(index.fullHeight, before, after);
    integer(index.indexedHeight, 0, full);
  } else index = validateUnavailable(node.index);
  const poolFields = ownRecord(node.pool);
  const pool = poolFields.status === 'present' || poolFields.status === 'not_found'
    ? exactRecord(node.pool, ['status']) : validateUnavailable(node.pool);
  return Object.freeze({ fullHeightBefore: before, fullHeightAfter: after,
    index: Object.freeze(index), pool: Object.freeze(pool) });
}
function validateUnavailable(value: unknown): Record<string, unknown> {
  const fields = exactRecord(value, ['status', 'reason', 'httpStatus']);
  if (fields.status !== 'unavailable') fail();
  if (fields.reason === 'http_error') integer(fields.httpStatus, 100, 599);
  else if ((fields.reason !== 'request_failed' && fields.reason !== 'invalid_response')
    || fields.httpStatus !== null) fail();
  return fields;
}
function asError(value: unknown): Error | null {
  try { return isNativeError?.(value) === true ? value as Error : null; }
  catch { return null; }
}
function ownRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value)) fail();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail();
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const keys = Reflect.ownKeys(value);
  if (keys.length > 32) fail();
  for (const key of keys) {
    if (typeof key !== 'string') fail();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor) || descriptor.enumerable !== true) fail();
    Object.defineProperty(output, key, { value: descriptor.value, enumerable: true });
  }
  return output;
}
function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const fields = ownRecord(value);
  if (Object.keys(fields).length !== keys.length || keys.some(key => !Object.hasOwn(fields, key))) fail();
  return fields;
}
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) fail();
  return value;
}
function hex(value: unknown): void {
  if (typeof value !== 'string' || value.length !== 64 || !/^[0-9a-f]{64}$/.test(value)) fail();
}
function parseText(text: string): unknown {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BYTES) fail();
  assertNoDuplicateJsonKeys(text);
  let value: unknown;
  try { value = JSON.parse(text) as unknown; } catch { fail(); }
  if (text !== `${canonicalJson(value)}\n`) fail();
  return value;
}
function assertExact(fields: Record<string, unknown>, expected: unknown): void {
  if (canonicalJson(fields) !== canonicalJson(expected)) fail();
}
function fail(): never { throw new Error('native committed reserve confirmation progress is invalid'); }
