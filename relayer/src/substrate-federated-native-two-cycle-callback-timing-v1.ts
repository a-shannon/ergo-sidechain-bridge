import { types } from 'node:util';
import { assertNoDuplicateJsonKeys, canonicalJson, sha256CanonicalJson }
  from './ergo-settlement-core/strict-json.js';
import { NATIVE_TWO_CYCLE_CYCLE_STEPS_V1, projectOwnNativeTwoCycleCycleStepFailureV1 }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';
import { projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 }
  from './substrate-federated-native-two-cycle-root-phase-v1.js';
import { projectOwnIsolatedErgoNodePostCallbackStageV1,
  projectOwnIsolatedErgoNodeCompletionFailureReasonV1 }
  from './substrate-federated-isolated-devnet-ergo-node-post-callback-stage-v1.js';
import { parseNativeTwoCycleWorkerOwnerStageV2, parseNativeTwoCycleParentOwnerStageV2 }
  from './substrate-federated-native-two-cycle-owner-stage-diagnostic-v1.js';
import { parseNativeTwoCycleWorkerRootPhaseV2 }
  from './substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';
import type { NativeTwoCycleFailureBindingsV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';

export const NATIVE_TWO_CYCLE_CALLBACK_TIMING_STEPS_V1 = Object.freeze([
  'pre-native-target', 'reward-input-discovery', 'history-collection', 'genesis-compilation',
  'genesis-materialization', 'native-process-start', ...NATIVE_TWO_CYCLE_CYCLE_STEPS_V1.slice(0,
    NATIVE_TWO_CYCLE_CYCLE_STEPS_V1.indexOf('target-exit') + 1), 'cycle-summary',
] as const);
export type CallbackTimingStepV1 = typeof NATIVE_TWO_CYCLE_CALLBACK_TIMING_STEPS_V1[number];
const QUANTUM_MS = 100;
const MAX_SEGMENTS = 64;
const MAX_DURATION_MS = 86_400_000;
const MAX_BYTES = 16 * 1024;
const WORKER_SCHEMA = 'e2s.substrate-federated-native-two-cycle-worker-callback-timing.v1';
const PARENT_SCHEMA = 'e2s.substrate-federated-native-two-cycle-parent-callback-timing.v1';
const WORKER_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_CALLBACK_TIMING_V1';
const PARENT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_CALLBACK_TIMING_V1';
const TRACE_KEYS = ['scope', 'unit', 'quantizationMs', 'segments', 'totalDurationMs'] as const;
const CLAIMS = Object.freeze({ operationCompletionEstablished: false as const,
  rootCleanupEstablished: false as const, rawCausePublished: false as const,
  performanceCauseEstablished: false as const });
interface Segment { readonly step: CallbackTimingStepV1; readonly durationMs: number }
export interface NativeTwoCycleCallbackTimingTraceV1 {
  readonly scope: 'first-mining-active-callback-interior';
  readonly unit: 'quantized-relative-monotonic-ms';
  readonly quantizationMs: 100;
  readonly segments: readonly Readonly<Segment>[];
  readonly totalDurationMs: number;
}
const FINISHED = new WeakSet<object>();
const DETAILS = new WeakMap<Error, Readonly<NativeTwoCycleCallbackTimingTraceV1>>();
const USED = new WeakSet<Error>();
const CONFLICTS = new WeakSet<Error>();

/** Diagnostic-only; clock failures disable detail without interrupting the callback. */
export function beginNativeTwoCycleCallbackTimingV1(clock: () => number = () => performance.now()) {
  let valid = true;
  let finished = false;
  let start = 0;
  let previous = 0;
  let boundary = 0;
  let step: CallbackTimingStepV1 = 'pre-native-target';
  const segments: Readonly<Segment>[] = [];
  const timestamp = (): number | null => {
    try {
      const now = clock();
      if (!Number.isFinite(now) || now < 0 || now > Number.MAX_SAFE_INTEGER
        || now < previous || now - start > MAX_DURATION_MS) { valid = false; return null; }
      previous = now;
      return Math.floor((now - start) / QUANTUM_MS) * QUANTUM_MS;
    } catch { valid = false; return null; }
  };
  try {
    start = clock(); previous = start;
    if (!Number.isFinite(start) || start < 0 || start > Number.MAX_SAFE_INTEGER) valid = false;
  } catch { valid = false; }
  const append = () => {
    const now = timestamp();
    if (now === null || segments.length >= MAX_SEGMENTS) { valid = false; return; }
    segments.push(Object.freeze({ step, durationMs: now - boundary })); boundary = now;
  };
  return Object.freeze({
    record(next: CallbackTimingStepV1): void {
      try {
        if (!valid || finished) return;
        if (!NATIVE_TWO_CYCLE_CALLBACK_TIMING_STEPS_V1.includes(next)) { valid = false; return; }
        append(); step = next;
      } catch { valid = false; }
    },
    finish(): Readonly<NativeTwoCycleCallbackTimingTraceV1> | null {
      try {
        if (!valid || finished) return null;
        finished = true; append();
        if (!valid) return null;
        const trace = validateTrace({ scope: 'first-mining-active-callback-interior',
          unit: 'quantized-relative-monotonic-ms', quantizationMs: QUANTUM_MS,
          segments, totalDurationMs: boundary });
        FINISHED.add(trace); return trace;
      } catch { valid = false; return null; }
    },
  });
}

/** Own original failure only. Aggregates, repeated tagging and cleanup omit detail. */
export function tagNativeTwoCycleCallbackTimingFailureV1<T>(value: T,
  trace: Readonly<NativeTwoCycleCallbackTimingTraceV1> | null): T {
  try {
    const error = ownEligibleError(value);
    if (error === null) return value;
    if (USED.has(error)) { CONFLICTS.add(error); return value; }
    USED.add(error);
    if (trace === null || !FINISHED.has(trace)) { CONFLICTS.add(error); return value; }
    DETAILS.set(error, trace);
  } catch { /* Optional metadata cannot change the thrown value. */ }
  return value;
}

export function projectNativeTwoCycleCallbackTimingFailureV1(value: unknown) {
  try {
    const error = ownEligibleError(value);
    return error === null || CONFLICTS.has(error) ? null : DETAILS.get(error) ?? null;
  } catch { return null; }
}

function ownEligibleError(value: unknown): Error | null {
  if (types.isProxy(value) || !types.isNativeError(value) || !(value instanceof Error)
    || value instanceof AggregateError) return null;
  let prototype: object | null = Object.getPrototypeOf(value);
  let depth = 0;
  while (prototype !== null) {
    if (++depth > 64 || types.isProxy(prototype)) return null;
    prototype = Object.getPrototypeOf(prototype);
  }
  const step = projectOwnNativeTwoCycleCycleStepFailureV1(value);
  return projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(value) === 'cycle-1'
    && step?.cycle === 'cycle-1' && step.step === 'cycle-summary'
    && projectOwnIsolatedErgoNodePostCallbackStageV1(value) === 'completion-check'
    && projectOwnIsolatedErgoNodeCompletionFailureReasonV1(value) === 'budget-exceeded' ? value : null;
}

export interface NativeTwoCycleCallbackTimingAncestorsV1 {
  readonly workerFailureText: string;
  readonly workerRootPhaseV2Text: string;
  readonly workerCycleStepText: string;
  readonly workerOwnerStageText: string;
  readonly workerOwnerStageV2Text: string;
}

function workerBody(bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  ancestors: Readonly<NativeTwoCycleCallbackTimingAncestorsV1>, trace: unknown) {
  const root = parseNativeTwoCycleWorkerRootPhaseV2(ancestors.workerRootPhaseV2Text, bindings);
  const owner = parseNativeTwoCycleWorkerOwnerStageV2(ancestors.workerOwnerStageV2Text, bindings,
    ancestors.workerFailureText, ancestors.workerRootPhaseV2Text, ancestors.workerCycleStepText,
    ancestors.workerOwnerStageText);
  if (root.cleanupErrorCount !== 0 || owner.completionFailureReason !== 'budget-exceeded') {
    throw new Error('native callback timing requires an unambiguous budget failure');
  }
  return Object.freeze({ schema: WORKER_SCHEMA, version: 1 as const,
    status: 'callback_timing_recorded' as const,
    configSha256Hex: owner.configSha256Hex, expectedBridgeCommit: owner.expectedBridgeCommit,
    pathIdentityDigestHex: owner.pathIdentityDigestHex,
    workerFailureReceiptDigestHex: owner.workerFailureReceiptDigestHex,
    workerRootPhaseV2ReceiptDigestHex: owner.workerRootPhaseV2ReceiptDigestHex,
    workerCycleStepReceiptDigestHex: owner.workerCycleStepReceiptDigestHex,
    workerOwnerStageReceiptDigestHex: owner.workerOwnerStageReceiptDigestHex,
    workerOwnerStageV2ReceiptDigestHex: owner.receiptDigestHex,
    cycle: owner.cycle, step: owner.step, ownerOperation: owner.ownerOperation,
    ownerStage: owner.ownerStage, completionFailureReason: owner.completionFailureReason,
    trace: validateTrace(trace), ...CLAIMS });
}

export function createNativeTwoCycleWorkerCallbackTimingV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  ancestors: Readonly<NativeTwoCycleCallbackTimingAncestorsV1>, trace: unknown) {
  const body = workerBody(bindings, ancestors, trace);
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, WORKER_DOMAIN) });
}

export function parseNativeTwoCycleWorkerCallbackTimingV1(text: string,
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  ancestors: Readonly<NativeTwoCycleCallbackTimingAncestorsV1>) {
  const fields = parseText(text);
  const expected = createNativeTwoCycleWorkerCallbackTimingV1(bindings, ancestors, fields.trace);
  if (canonicalJson(fields) !== canonicalJson(expected)) {
    throw new Error('native worker callback timing identity, lineage, claims or digest differ');
  }
  return expected;
}

export function createNativeTwoCycleParentCallbackTimingV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>, failureReceiptDigestHex: string,
  ancestors: Readonly<NativeTwoCycleCallbackTimingAncestorsV1>, workerTimingText: string,
  parentOwnerStageV1Text: string, parentOwnerStageV2Text: string) {
  const worker = parseNativeTwoCycleWorkerCallbackTimingV1(workerTimingText, bindings, ancestors);
  const parent = parseNativeTwoCycleParentOwnerStageV2(parentOwnerStageV2Text, bindings,
    failureReceiptDigestHex, ancestors.workerFailureText, ancestors.workerRootPhaseV2Text,
    ancestors.workerCycleStepText, ancestors.workerOwnerStageText,
    ancestors.workerOwnerStageV2Text, parentOwnerStageV1Text);
  if (parent.workerOwnerStageV2ReceiptDigestHex !== worker.workerOwnerStageV2ReceiptDigestHex
    || parent.completionFailureReason !== 'budget-exceeded') {
    throw new Error('native parent callback timing ancestry differs');
  }
  const { receiptDigestHex: workerDigest, schema: ignoredSchema, status: ignoredStatus, ...detail } = worker;
  void ignoredSchema; void ignoredStatus;
  const body = Object.freeze({ ...detail, schema: PARENT_SCHEMA,
    status: 'callback_timing_diagnostics_validated' as const,
    failureReceiptDigestHex: parent.failureReceiptDigestHex,
    workerCallbackTimingReceiptDigestHex: workerDigest,
    parentOwnerStageV2ReceiptDigestHex: parent.receiptDigestHex });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, PARENT_DOMAIN) });
}

export function parseNativeTwoCycleParentCallbackTimingV1(text: string,
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>, failureReceiptDigestHex: string,
  ancestors: Readonly<NativeTwoCycleCallbackTimingAncestorsV1>, workerTimingText: string,
  parentOwnerStageV1Text: string, parentOwnerStageV2Text: string) {
  const fields = parseText(text);
  const expected = createNativeTwoCycleParentCallbackTimingV1(bindings, failureReceiptDigestHex,
    ancestors, workerTimingText, parentOwnerStageV1Text, parentOwnerStageV2Text);
  if (canonicalJson(fields) !== canonicalJson(expected)) {
    throw new Error('native parent callback timing identity, lineage, claims or digest differ');
  }
  return expected;
}

function validateTrace(value: unknown): Readonly<NativeTwoCycleCallbackTimingTraceV1> {
  const fields = exactRecord(value, TRACE_KEYS);
  if (fields.scope !== 'first-mining-active-callback-interior'
    || fields.unit !== 'quantized-relative-monotonic-ms' || fields.quantizationMs !== QUANTUM_MS
    || types.isProxy(fields.segments) || !Array.isArray(fields.segments)
    || Object.getPrototypeOf(fields.segments) !== Array.prototype) {
    throw new Error('native callback timing scope, unit or bound differs');
  }
  const supplied = fields.segments;
  const length: unknown = Object.getOwnPropertyDescriptor(supplied, 'length')?.value;
  if (typeof length !== 'number' || !Number.isSafeInteger(length)
    || length < 2 || length > MAX_SEGMENTS || Reflect.ownKeys(supplied).length !== length + 1) {
    throw new Error('native callback timing segment array differs');
  }
  const segments: Readonly<Segment>[] = [];
  let sum = 0;
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(supplied, String(index));
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new Error('native callback timing segment must be an own data value');
    }
    const segment = exactRecord(descriptor.value, ['step', 'durationMs']);
    if (typeof segment.step !== 'string'
      || !NATIVE_TWO_CYCLE_CALLBACK_TIMING_STEPS_V1.includes(segment.step as CallbackTimingStepV1)) {
      throw new Error('native callback timing step differs');
    }
    duration(segment.durationMs);
    if ((index === 0 && segment.step !== 'pre-native-target')
      || (index !== 0 && segment.step === 'pre-native-target')
      || (index === length - 1 && segment.step !== 'cycle-summary')
      || (index !== length - 1 && segment.step === 'cycle-summary')) {
      throw new Error('native callback timing boundaries differ');
    }
    segments[index] = Object.freeze({ step: segment.step as CallbackTimingStepV1,
      durationMs: segment.durationMs as number });
    sum += segment.durationMs as number;
  }
  duration(fields.totalDurationMs);
  if (!Number.isSafeInteger(sum) || sum !== fields.totalDurationMs || sum > MAX_DURATION_MS) {
    throw new Error('native callback timing boundaries or sum differ');
  }
  const trace = Object.freeze({ scope: fields.scope, unit: fields.unit,
    quantizationMs: QUANTUM_MS, segments: Object.freeze(segments), totalDurationMs: sum } as const);
  if (Buffer.byteLength(canonicalJson(trace), 'utf8') > MAX_BYTES / 2) {
    throw new Error('native callback timing trace bytes exceed bound');
  }
  return trace;
}

function duration(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0
    || Object.is(value, -0) || value > MAX_DURATION_MS || value % QUANTUM_MS !== 0) {
    throw new Error('native callback timing duration differs');
  }
}
function parseText(text: string) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    throw new Error('native callback timing text exceeds bound');
  }
  assertNoDuplicateJsonKeys(text);
  const value: unknown = JSON.parse(text);
  if (text !== `${canonicalJson(value)}\n`) throw new Error('native callback timing text is not canonical');
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('native callback timing receipt must be an object');
  }
  return value as Record<string, unknown>;
}
function exactRecord(value: unknown, keys: readonly string[]) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value)
    || Object.keys(value).length !== keys.length) throw new Error('native callback timing fields differ');
  const fields: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) throw new Error('native callback timing fields differ');
    fields[key] = descriptor.value;
  }
  return fields;
}
