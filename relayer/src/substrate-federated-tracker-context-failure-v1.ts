import { assertNoDuplicateJsonKeys, canonicalJson, sha256CanonicalJson }
  from './ergo-settlement-core/strict-json.js';
import { projectNativeTwoCycleCycleStepFailureV1, projectOwnNativeTwoCycleCycleStepFailureV1 }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';
import { parseNativeTwoCycleWorkerCycleStepV1, parseNativeTwoCycleParentCycleStepV1 }
  from './substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { type NativeTwoCycleFailureBindingsV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 }
  from './substrate-federated-native-two-cycle-root-phase-v1.js';

export const SUBSTRATE_FEDERATED_TRACKER_V2_BUILD_FAILURE_PHASES_V1 = Object.freeze([
  'ingress', 'provenance', 'statement', 'membership', 'tracker-input',
  'avl-transition', 'serialization',
] as const);
export type SubstrateFederatedTrackerV2BuildFailurePhaseV1 =
  typeof SUBSTRATE_FEDERATED_TRACKER_V2_BUILD_FAILURE_PHASES_V1[number];

const PHASES = new WeakMap<Error, SubstrateFederatedTrackerV2BuildFailurePhaseV1>();
const CONFLICTS = new WeakSet<Error>();
const MAX_INSPECTED_VALUES = 64;
// Node 24.14 provides the intrinsic native-error brand check. Unlike instanceof,
// it rejects proxies and prototype forgeries without consulting caller fields.
const isNativeError = (Error as ErrorConstructor & {
  isError?: (value: unknown) => boolean;
}).isError;

/** Invocation-local diagnostic metadata only; preserve the exact thrown value. */
export function tagSubstrateFederatedTrackerV2BuildFailurePhaseV1<T>(
  value: T, phase: SubstrateFederatedTrackerV2BuildFailurePhaseV1,
): T {
  const error = asError(value);
  if (error === null) return value;
  if (!isPhase(phase)) CONFLICTS.add(error);
  else {
    const previous = PHASES.get(error);
    if (previous === undefined) PHASES.set(error, phase);
    else if (previous !== phase) CONFLICTS.add(error);
  }
  return value;
}

/** Own producer metadata; no messages, stacks, caller labels or ancestry. */
export function projectOwnSubstrateFederatedTrackerV2BuildFailurePhaseV1(
  value: unknown,
): SubstrateFederatedTrackerV2BuildFailurePhaseV1 | null {
  const error = asError(value);
  return error === null || CONFLICTS.has(error) ? null : PHASES.get(error) ?? null;
}

/** Require the actual phase-bearing primary error's own matching cycle and step. */
export function projectSubstrateFederatedTrackerV2BuildFailurePhaseV1(
  value: unknown,
): SubstrateFederatedTrackerV2BuildFailurePhaseV1 | null {
  try {
    // The existing projector validates the complete bounded aggregate graph,
    // including proxies, getters, cycles and custom array iteration, first.
    const step = projectNativeTwoCycleCycleStepFailureV1(value);
    if (step?.step !== 'tracker-context') return null;
    const pending = [{ value, cleanupAncestor: false }];
    const seen = new WeakMap<Error, number>();
    let result: SubstrateFederatedTrackerV2BuildFailurePhaseV1 | null = null;
    let tagged = 0;
    let inspected = 0;
    while (pending.length > 0) {
      if (++inspected > MAX_INSPECTED_VALUES) return null;
      const next = pending.pop()!;
      const current = asError(next.value);
      if (current === null || CONFLICTS.has(current)) return null;
      const ownRoot = projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(current);
      const cleanupAncestor = next.cleanupAncestor || ownRoot === 'cleanup';
      const phase = PHASES.get(current);
      if (phase !== undefined && cleanupAncestor) return null;
      const context = cleanupAncestor ? 2 : 1;
      const previous = seen.get(current) ?? 0;
      if ((previous & context) !== 0) continue;
      seen.set(current, previous | context);
      if (phase !== undefined) {
        if (++tagged > 1 || ownRoot !== step.cycle) return null;
        const ownStep = projectOwnNativeTwoCycleCycleStepFailureV1(current);
        if (ownStep?.cycle !== step.cycle || ownStep.step !== 'tracker-context') return null;
        result = phase;
      }
      if (current instanceof AggregateError) {
        const children: unknown = Object.getOwnPropertyDescriptor(current, 'errors')?.value;
        if (!Array.isArray(children)) return null;
        const length: unknown = Object.getOwnPropertyDescriptor(children, 'length')?.value;
        if (!Number.isSafeInteger(length) || (length as number) < 0
          || (length as number) > MAX_INSPECTED_VALUES - inspected) return null;
        for (let index = 0; index < (length as number); index++) {
          const descriptor = Object.getOwnPropertyDescriptor(children, String(index));
          if (descriptor === undefined || !('value' in descriptor)) return null;
          pending.push({ value: descriptor.value, cleanupAncestor });
        }
      }
    }
    return result;
  } catch { return null; }
}

const WORKER_SCHEMA = 'e2s.substrate-federated-native-two-cycle-worker-tracker-context.v1';
const PARENT_SCHEMA = 'e2s.substrate-federated-native-two-cycle-parent-tracker-context.v1';
const WORKER_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_TRACKER_CONTEXT_V1';
const PARENT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_TRACKER_CONTEXT_V1';
const MAX_BYTES = 16 * 1024;
const WORKER_KEYS = [
  'schema', 'version', 'status', 'configSha256Hex', 'expectedBridgeCommit',
  'pathIdentityDigestHex', 'workerFailureReceiptDigestHex',
  'workerRootPhaseV2ReceiptDigestHex', 'workerCycleStepReceiptDigestHex',
  'cycle', 'step', 'trackerContextPhase', 'operationCompletionEstablished',
  'rootCleanupEstablished', 'rawCausePublished', 'receiptDigestHex',
] as const;
const PARENT_KEYS = [...WORKER_KEYS, 'failureReceiptDigestHex',
  'workerTrackerContextReceiptDigestHex', 'parentCycleStepReceiptDigestHex'] as const;

interface TrackerContextDetail {
  readonly cycle: 'cycle-1' | 'cycle-2';
  readonly step: 'tracker-context';
  readonly trackerContextPhase: SubstrateFederatedTrackerV2BuildFailurePhaseV1;
  readonly operationCompletionEstablished: false;
  readonly rootCleanupEstablished: false;
  readonly rawCausePublished: false;
}

export interface NativeTwoCycleWorkerTrackerContextV1
  extends NativeTwoCycleFailureBindingsV1, TrackerContextDetail {
  readonly schema: typeof WORKER_SCHEMA;
  readonly version: 1;
  readonly status: 'tracker_context_operation_failed';
  readonly workerFailureReceiptDigestHex: string;
  readonly workerRootPhaseV2ReceiptDigestHex: string;
  readonly workerCycleStepReceiptDigestHex: string;
  readonly receiptDigestHex: string;
}

export interface NativeTwoCycleParentTrackerContextV1
  extends NativeTwoCycleFailureBindingsV1, TrackerContextDetail {
  readonly schema: typeof PARENT_SCHEMA;
  readonly version: 1;
  readonly status: 'tracker_context_diagnostics_validated';
  readonly failureReceiptDigestHex: string;
  readonly workerFailureReceiptDigestHex: string;
  readonly workerRootPhaseV2ReceiptDigestHex: string;
  readonly workerCycleStepReceiptDigestHex: string;
  readonly workerTrackerContextReceiptDigestHex: string;
  readonly parentCycleStepReceiptDigestHex: string;
  readonly receiptDigestHex: string;
}

/** Optional diagnostic self-consistency; no cleanup, completion or funds authority. */
export function createNativeTwoCycleWorkerTrackerContextV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  workerFailureText: string,
  workerRootPhaseV2Text: string,
  workerCycleStepText: string,
  phase: SubstrateFederatedTrackerV2BuildFailurePhaseV1,
): Readonly<NativeTwoCycleWorkerTrackerContextV1> {
  const expected = validateBindings(bindings);
  const cycleStep = parseNativeTwoCycleWorkerCycleStepV1(workerCycleStepText, expected,
    workerFailureText, workerRootPhaseV2Text);
  if (cycleStep.step !== 'tracker-context') {
    throw new Error('native two-cycle tracker context requires tracker-context step');
  }
  const body = Object.freeze({
    schema: WORKER_SCHEMA, version: 1 as const,
    status: 'tracker_context_operation_failed' as const,
    ...expected,
    workerFailureReceiptDigestHex: cycleStep.workerFailureReceiptDigestHex,
    workerRootPhaseV2ReceiptDigestHex: cycleStep.workerRootPhaseV2ReceiptDigestHex,
    workerCycleStepReceiptDigestHex: cycleStep.receiptDigestHex,
    cycle: cycleStep.cycle, step: 'tracker-context' as const,
    trackerContextPhase: validatePhase(phase),
    operationCompletionEstablished: false as const,
    rootCleanupEstablished: false as const, rawCausePublished: false as const,
  });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, WORKER_DOMAIN) });
}

export function parseNativeTwoCycleWorkerTrackerContextV1(
  text: string,
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  workerFailureText: string,
  workerRootPhaseV2Text: string,
  workerCycleStepText: string,
): Readonly<NativeTwoCycleWorkerTrackerContextV1> {
  const fields = exactRecord(parseText(text), WORKER_KEYS);
  const expected = createNativeTwoCycleWorkerTrackerContextV1(bindings, workerFailureText,
    workerRootPhaseV2Text, workerCycleStepText, validatePhase(fields.trackerContextPhase));
  if (canonicalJson(fields) !== canonicalJson(expected)) {
    throw new Error('native two-cycle tracker context identity, claims, lineage or digest differ');
  }
  return expected;
}

/** Bind the exact validated parent cycle-step and terminal digest without restoring authority. */
export function createNativeTwoCycleParentTrackerContextV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  failureReceiptDigestHex: string,
  workerFailureText: string,
  workerRootPhaseV2Text: string,
  workerCycleStepText: string,
  workerTrackerContextText: string,
  parentCycleStepText: string,
): Readonly<NativeTwoCycleParentTrackerContextV1> {
  const worker = parseNativeTwoCycleWorkerTrackerContextV1(workerTrackerContextText, bindings,
    workerFailureText, workerRootPhaseV2Text, workerCycleStepText);
  const parent = parseNativeTwoCycleParentCycleStepV1(parentCycleStepText, bindings,
    failureReceiptDigestHex, workerFailureText, workerRootPhaseV2Text, workerCycleStepText);
  if (parent.step !== 'tracker-context' || parent.cycle !== worker.cycle
    || parent.workerCycleStepReceiptDigestHex !== worker.workerCycleStepReceiptDigestHex) {
    throw new Error('native two-cycle parent tracker context ancestry differs');
  }
  const body = Object.freeze({
    schema: PARENT_SCHEMA, version: 1 as const,
    status: 'tracker_context_diagnostics_validated' as const,
    ...validateBindings(bindings),
    failureReceiptDigestHex: lowerHex(failureReceiptDigestHex, 32),
    workerFailureReceiptDigestHex: worker.workerFailureReceiptDigestHex,
    workerRootPhaseV2ReceiptDigestHex: worker.workerRootPhaseV2ReceiptDigestHex,
    workerCycleStepReceiptDigestHex: worker.workerCycleStepReceiptDigestHex,
    workerTrackerContextReceiptDigestHex: worker.receiptDigestHex,
    parentCycleStepReceiptDigestHex: parent.receiptDigestHex,
    cycle: worker.cycle, step: worker.step, trackerContextPhase: worker.trackerContextPhase,
    operationCompletionEstablished: false as const,
    rootCleanupEstablished: false as const, rawCausePublished: false as const,
  });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, PARENT_DOMAIN) });
}

export function parseNativeTwoCycleParentTrackerContextV1(
  text: string,
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  failureReceiptDigestHex: string,
  workerFailureText: string,
  workerRootPhaseV2Text: string,
  workerCycleStepText: string,
  workerTrackerContextText: string,
  parentCycleStepText: string,
): Readonly<NativeTwoCycleParentTrackerContextV1> {
  const fields = exactRecord(parseText(text), PARENT_KEYS);
  const expected = createNativeTwoCycleParentTrackerContextV1(bindings,
    failureReceiptDigestHex, workerFailureText, workerRootPhaseV2Text, workerCycleStepText,
    workerTrackerContextText, parentCycleStepText);
  if (canonicalJson(fields) !== canonicalJson(expected)) {
    throw new Error('native two-cycle parent tracker context identity, claims, lineage or digest differ');
  }
  return expected;
}

function asError(value: unknown): Error | null {
  try { return isNativeError?.(value) === true ? value as Error : null; }
  catch { return null; }
}

function isPhase(value: unknown): value is SubstrateFederatedTrackerV2BuildFailurePhaseV1 {
  return typeof value === 'string'
    && SUBSTRATE_FEDERATED_TRACKER_V2_BUILD_FAILURE_PHASES_V1.includes(
      value as SubstrateFederatedTrackerV2BuildFailurePhaseV1);
}

function validatePhase(value: unknown): SubstrateFederatedTrackerV2BuildFailurePhaseV1 {
  if (!isPhase(value)) throw new Error('native two-cycle tracker context phase is unsupported');
  return value;
}

function validateBindings(bindings: Readonly<NativeTwoCycleFailureBindingsV1>) {
  const record = exactRecord(bindings, ['configSha256Hex', 'expectedBridgeCommit', 'pathIdentityDigestHex']);
  return Object.freeze({ configSha256Hex: lowerHex(record.configSha256Hex, 32),
    expectedBridgeCommit: lowerHex(record.expectedBridgeCommit, 20),
    pathIdentityDigestHex: lowerHex(record.pathIdentityDigestHex, 32) });
}

function parseText(text: string): unknown {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    throw new Error('native two-cycle tracker context companion is not bounded text');
  }
  assertNoDuplicateJsonKeys(text);
  let value: unknown;
  try { value = JSON.parse(text) as unknown; }
  catch { throw new Error('native two-cycle tracker context companion is invalid JSON'); }
  if (text !== `${canonicalJson(value)}\n`) {
    throw new Error('native two-cycle tracker context companion is not canonical JSON');
  }
  return value;
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('native two-cycle tracker context companion must be an object');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length
    || keys.some(key => !Object.prototype.hasOwnProperty.call(record, key))) {
    throw new Error('native two-cycle tracker context companion fields differ');
  }
  return record;
}

function lowerHex(value: unknown, bytes: number): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)) {
    throw new Error('native two-cycle tracker context hex identity differs');
  }
  return value;
}
