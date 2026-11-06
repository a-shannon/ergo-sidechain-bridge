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

export const SUBSTRATE_FEDERATED_NATIVE_COMMITTED_RESERVE_FAILURE_STAGES_V1 = Object.freeze([
  'ingress', 'native-check', 'check-promotion', 'authorization', 'journal-reconciliation',
  'operational-execution', 'operational-sign', 'operational-check', 'operational-revalidate',
  'operational-authorize', 'operational-reserve', 'operational-finalize', 'operational-submit',
  'transport-validation', 'confirmation', 'confirmed-journal', 'output-observation',
] as const);
export type SubstrateFederatedNativeCommittedReserveFailureStageV1 =
  typeof SUBSTRATE_FEDERATED_NATIVE_COMMITTED_RESERVE_FAILURE_STAGES_V1[number];
export type SubstrateFederatedNativeCommittedReserveKindV1 = 'genesis' | 'continuation';
export interface SubstrateFederatedNativeCommittedReserveFailureProjectionV1 {
  readonly committedReserveStage: SubstrateFederatedNativeCommittedReserveFailureStageV1;
  readonly committedReserveKind: SubstrateFederatedNativeCommittedReserveKindV1;
}

const STAGES = new WeakMap<Error, SubstrateFederatedNativeCommittedReserveFailureStageV1>();
const KINDS = new WeakMap<Error, SubstrateFederatedNativeCommittedReserveKindV1>();
const CONFLICTS = new WeakSet<Error>();
const MAX_INSPECTED_VALUES = 64;
// Node 24.14 provides the intrinsic native-error brand check. Unlike instanceof,
// it rejects proxies and prototype forgeries without consulting caller fields.
const isNativeError = (Error as ErrorConstructor & {
  isError?: (value: unknown) => boolean;
}).isError;

/** Invocation-local diagnostic metadata only; preserve the exact thrown value. */
export function tagSubstrateFederatedNativeCommittedReserveFailureStageV1<T>(
  value: T, stage: SubstrateFederatedNativeCommittedReserveFailureStageV1,
  kind?: SubstrateFederatedNativeCommittedReserveKindV1,
): T {
  const error = asError(value);
  if (error === null) return value;
  if (!isStage(stage)) CONFLICTS.add(error);
  else {
    const previous = STAGES.get(error);
    if (previous === undefined) STAGES.set(error, stage);
    else if (previous !== stage) CONFLICTS.add(error);
  }
  if (kind !== undefined) {
    if (!isKind(kind)) CONFLICTS.add(error);
    else {
      const previous = KINDS.get(error);
      if (previous === undefined) KINDS.set(error, kind);
      else if (previous !== kind) CONFLICTS.add(error);
    }
  }
  return value;
}

/** Own producer metadata; no messages, stacks, caller labels or ancestry. */
export function projectOwnSubstrateFederatedNativeCommittedReserveFailureStageV1(
  value: unknown,
): SubstrateFederatedNativeCommittedReserveFailureStageV1 | null {
  const error = asError(value);
  return error === null || CONFLICTS.has(error) ? null : STAGES.get(error) ?? null;
}

/** Own operation kind only; a checker-only stage does not supply a kind. */
export function projectOwnSubstrateFederatedNativeCommittedReserveKindV1(
  value: unknown,
): SubstrateFederatedNativeCommittedReserveKindV1 | null {
  const error = asError(value);
  return error === null || CONFLICTS.has(error) ? null : KINDS.get(error) ?? null;
}

/** Require the actual stage-bearing primary error's own kind, cycle and step. */
export function projectSubstrateFederatedNativeCommittedReserveFailureStageV1(
  value: unknown,
): Readonly<SubstrateFederatedNativeCommittedReserveFailureProjectionV1> | null {
  try {
    // The existing projector validates the complete bounded aggregate graph,
    // including proxies, getters, cycles and custom array iteration, first.
    const step = projectNativeTwoCycleCycleStepFailureV1(value);
    if (step?.step !== 'committed-reserve') return null;
    const pending = [{ value, cleanupAncestor: false }];
    const seen = new WeakMap<Error, number>();
    let result: Readonly<SubstrateFederatedNativeCommittedReserveFailureProjectionV1> | null = null;
    let tagged = 0;
    let inspected = 0;
    while (pending.length > 0) {
      if (++inspected > MAX_INSPECTED_VALUES) return null;
      const next = pending.pop()!;
      const current = asError(next.value);
      if (current === null || CONFLICTS.has(current)) return null;
      const ownRoot = projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(current);
      const cleanupAncestor = next.cleanupAncestor || ownRoot === 'cleanup';
      const stage = STAGES.get(current);
      const kind = KINDS.get(current);
      if ((stage !== undefined || kind !== undefined) && cleanupAncestor) return null;
      const context = cleanupAncestor ? 2 : 1;
      const previous = seen.get(current) ?? 0;
      if ((previous & context) !== 0) continue;
      seen.set(current, previous | context);
      if (stage !== undefined) {
        if (++tagged > 1 || ownRoot !== step.cycle || kind === undefined) return null;
        const ownStep = projectOwnNativeTwoCycleCycleStepFailureV1(current);
        if (ownStep?.cycle !== step.cycle || ownStep.step !== 'committed-reserve') return null;
        result = Object.freeze({ committedReserveStage: stage, committedReserveKind: kind });
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

const WORKER_SCHEMA = 'e2s.substrate-federated-native-two-cycle-worker-committed-reserve-stage.v1';
const PARENT_SCHEMA = 'e2s.substrate-federated-native-two-cycle-parent-committed-reserve-stage.v1';
const WORKER_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_COMMITTED_RESERVE_STAGE_V1';
const PARENT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_COMMITTED_RESERVE_STAGE_V1';
const MAX_BYTES = 16 * 1024;
const WORKER_KEYS = [
  'schema', 'version', 'status', 'configSha256Hex', 'expectedBridgeCommit',
  'pathIdentityDigestHex', 'workerFailureReceiptDigestHex',
  'workerRootPhaseV2ReceiptDigestHex', 'workerCycleStepReceiptDigestHex',
  'cycle', 'step', 'committedReserveStage', 'committedReserveKind', 'operationCompletionEstablished',
  'rootCleanupEstablished', 'rawCausePublished', 'receiptDigestHex',
] as const;
const PARENT_KEYS = [...WORKER_KEYS, 'failureReceiptDigestHex',
  'workerCommittedReserveStageReceiptDigestHex', 'parentCycleStepReceiptDigestHex'] as const;

interface CommittedReserveStageDetail {
  readonly cycle: 'cycle-1' | 'cycle-2';
  readonly step: 'committed-reserve';
  readonly committedReserveStage: SubstrateFederatedNativeCommittedReserveFailureStageV1;
  readonly committedReserveKind: SubstrateFederatedNativeCommittedReserveKindV1;
  readonly operationCompletionEstablished: false;
  readonly rootCleanupEstablished: false;
  readonly rawCausePublished: false;
}

export interface NativeTwoCycleWorkerCommittedReserveStageV1
  extends NativeTwoCycleFailureBindingsV1, CommittedReserveStageDetail {
  readonly schema: typeof WORKER_SCHEMA;
  readonly version: 1;
  readonly status: 'committed_reserve_operation_failed';
  readonly workerFailureReceiptDigestHex: string;
  readonly workerRootPhaseV2ReceiptDigestHex: string;
  readonly workerCycleStepReceiptDigestHex: string;
  readonly receiptDigestHex: string;
}

export interface NativeTwoCycleParentCommittedReserveStageV1
  extends NativeTwoCycleFailureBindingsV1, CommittedReserveStageDetail {
  readonly schema: typeof PARENT_SCHEMA;
  readonly version: 1;
  readonly status: 'committed_reserve_diagnostics_validated';
  readonly failureReceiptDigestHex: string;
  readonly workerFailureReceiptDigestHex: string;
  readonly workerRootPhaseV2ReceiptDigestHex: string;
  readonly workerCycleStepReceiptDigestHex: string;
  readonly workerCommittedReserveStageReceiptDigestHex: string;
  readonly parentCycleStepReceiptDigestHex: string;
  readonly receiptDigestHex: string;
}

/** Optional diagnostic self-consistency; no cleanup, completion or funds authority. */
export function createNativeTwoCycleWorkerCommittedReserveStageV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  workerFailureText: string,
  workerRootPhaseV2Text: string,
  workerCycleStepText: string,
  stage: SubstrateFederatedNativeCommittedReserveFailureStageV1,
  kind: SubstrateFederatedNativeCommittedReserveKindV1,
): Readonly<NativeTwoCycleWorkerCommittedReserveStageV1> {
  const expected = validateBindings(bindings);
  const cycleStep = parseNativeTwoCycleWorkerCycleStepV1(workerCycleStepText, expected,
    workerFailureText, workerRootPhaseV2Text);
  if (cycleStep.step !== 'committed-reserve') {
    throw new Error('native two-cycle committed reserve stage requires committed-reserve step');
  }
  const body = Object.freeze({
    schema: WORKER_SCHEMA, version: 1 as const,
    status: 'committed_reserve_operation_failed' as const,
    ...expected,
    workerFailureReceiptDigestHex: cycleStep.workerFailureReceiptDigestHex,
    workerRootPhaseV2ReceiptDigestHex: cycleStep.workerRootPhaseV2ReceiptDigestHex,
    workerCycleStepReceiptDigestHex: cycleStep.receiptDigestHex,
    cycle: cycleStep.cycle, step: 'committed-reserve' as const,
    committedReserveStage: validateStage(stage),
    committedReserveKind: validateKind(kind),
    operationCompletionEstablished: false as const,
    rootCleanupEstablished: false as const, rawCausePublished: false as const,
  });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, WORKER_DOMAIN) });
}

export function parseNativeTwoCycleWorkerCommittedReserveStageV1(
  text: string,
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  workerFailureText: string,
  workerRootPhaseV2Text: string,
  workerCycleStepText: string,
): Readonly<NativeTwoCycleWorkerCommittedReserveStageV1> {
  const fields = exactRecord(parseText(text), WORKER_KEYS);
  const expected = createNativeTwoCycleWorkerCommittedReserveStageV1(bindings, workerFailureText,
    workerRootPhaseV2Text, workerCycleStepText, validateStage(fields.committedReserveStage),
    validateKind(fields.committedReserveKind));
  if (canonicalJson(fields) !== canonicalJson(expected)) {
    throw new Error('native two-cycle committed reserve stage identity, claims, lineage or digest differ');
  }
  return expected;
}

/** Bind the exact validated parent cycle-step and terminal digest without restoring authority. */
export function createNativeTwoCycleParentCommittedReserveStageV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  failureReceiptDigestHex: string,
  workerFailureText: string,
  workerRootPhaseV2Text: string,
  workerCycleStepText: string,
  workerCommittedReserveStageText: string,
  parentCycleStepText: string,
): Readonly<NativeTwoCycleParentCommittedReserveStageV1> {
  const worker = parseNativeTwoCycleWorkerCommittedReserveStageV1(workerCommittedReserveStageText, bindings,
    workerFailureText, workerRootPhaseV2Text, workerCycleStepText);
  const parent = parseNativeTwoCycleParentCycleStepV1(parentCycleStepText, bindings,
    failureReceiptDigestHex, workerFailureText, workerRootPhaseV2Text, workerCycleStepText);
  if (parent.step !== 'committed-reserve' || parent.cycle !== worker.cycle
    || parent.workerCycleStepReceiptDigestHex !== worker.workerCycleStepReceiptDigestHex) {
    throw new Error('native two-cycle parent committed reserve stage ancestry differs');
  }
  const body = Object.freeze({
    schema: PARENT_SCHEMA, version: 1 as const,
    status: 'committed_reserve_diagnostics_validated' as const,
    ...validateBindings(bindings),
    failureReceiptDigestHex: lowerHex(failureReceiptDigestHex, 32),
    workerFailureReceiptDigestHex: worker.workerFailureReceiptDigestHex,
    workerRootPhaseV2ReceiptDigestHex: worker.workerRootPhaseV2ReceiptDigestHex,
    workerCycleStepReceiptDigestHex: worker.workerCycleStepReceiptDigestHex,
    workerCommittedReserveStageReceiptDigestHex: worker.receiptDigestHex,
    parentCycleStepReceiptDigestHex: parent.receiptDigestHex,
    cycle: worker.cycle, step: worker.step, committedReserveStage: worker.committedReserveStage,
    committedReserveKind: worker.committedReserveKind,
    operationCompletionEstablished: false as const,
    rootCleanupEstablished: false as const, rawCausePublished: false as const,
  });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, PARENT_DOMAIN) });
}

export function parseNativeTwoCycleParentCommittedReserveStageV1(
  text: string,
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  failureReceiptDigestHex: string,
  workerFailureText: string,
  workerRootPhaseV2Text: string,
  workerCycleStepText: string,
  workerCommittedReserveStageText: string,
  parentCycleStepText: string,
): Readonly<NativeTwoCycleParentCommittedReserveStageV1> {
  const fields = exactRecord(parseText(text), PARENT_KEYS);
  const expected = createNativeTwoCycleParentCommittedReserveStageV1(bindings,
    failureReceiptDigestHex, workerFailureText, workerRootPhaseV2Text, workerCycleStepText,
    workerCommittedReserveStageText, parentCycleStepText);
  if (canonicalJson(fields) !== canonicalJson(expected)) {
    throw new Error('native two-cycle parent committed reserve stage identity, claims, lineage or digest differ');
  }
  return expected;
}

function asError(value: unknown): Error | null {
  try { return isNativeError?.(value) === true ? value as Error : null; }
  catch { return null; }
}

function isStage(value: unknown): value is SubstrateFederatedNativeCommittedReserveFailureStageV1 {
  return typeof value === 'string'
    && SUBSTRATE_FEDERATED_NATIVE_COMMITTED_RESERVE_FAILURE_STAGES_V1.includes(
      value as SubstrateFederatedNativeCommittedReserveFailureStageV1);
}

function validateStage(value: unknown): SubstrateFederatedNativeCommittedReserveFailureStageV1 {
  if (!isStage(value)) throw new Error('native two-cycle committed reserve stage is unsupported');
  return value;
}

function isKind(value: unknown): value is SubstrateFederatedNativeCommittedReserveKindV1 {
  return value === 'genesis' || value === 'continuation';
}

function validateKind(value: unknown): SubstrateFederatedNativeCommittedReserveKindV1 {
  if (!isKind(value)) throw new Error('native two-cycle committed reserve kind is unsupported');
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
    throw new Error('native two-cycle committed reserve stage companion is not bounded text');
  }
  assertNoDuplicateJsonKeys(text);
  let value: unknown;
  try { value = JSON.parse(text) as unknown; }
  catch { throw new Error('native two-cycle committed reserve stage companion is invalid JSON'); }
  if (text !== `${canonicalJson(value)}\n`) {
    throw new Error('native two-cycle committed reserve stage companion is not canonical JSON');
  }
  return value;
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('native two-cycle committed reserve stage companion must be an object');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length
    || keys.some(key => !Object.prototype.hasOwnProperty.call(record, key))) {
    throw new Error('native two-cycle committed reserve stage companion fields differ');
  }
  return record;
}

function lowerHex(value: unknown, bytes: number): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)) {
    throw new Error('native two-cycle committed reserve stage hex identity differs');
  }
  return value;
}
