import { assertNoDuplicateJsonKeys, canonicalJson, sha256CanonicalJson }
  from './ergo-settlement-core/strict-json.js';
import { NATIVE_TWO_CYCLE_CYCLE_STEPS_V1, type NativeTwoCycleCycleStepV1 }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';
import { parseNativeTwoCycleWorkerFailureDiagnosticV1, type NativeTwoCycleFailureBindingsV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { parseNativeTwoCycleWorkerRootPhaseV2 }
  from './substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';

const WORKER_SCHEMA = 'e2s.substrate-federated-native-two-cycle-worker-cycle-step.v1';
const PARENT_SCHEMA = 'e2s.substrate-federated-native-two-cycle-parent-cycle-step.v1';
const WORKER_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_CYCLE_STEP_V1';
const PARENT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_CYCLE_STEP_V1';
const MAX_BYTES = 16 * 1024;
const WORKER_KEYS = [
  'schema', 'version', 'status', 'configSha256Hex', 'expectedBridgeCommit',
  'pathIdentityDigestHex', 'workerFailureReceiptDigestHex',
  'workerRootPhaseV2ReceiptDigestHex', 'cycle', 'step',
  'operationCompletionEstablished', 'rootCleanupEstablished', 'rawCausePublished',
  'receiptDigestHex',
] as const;

interface CycleStepDetail {
  readonly cycle: 'cycle-1' | 'cycle-2';
  readonly step: NativeTwoCycleCycleStepV1;
  readonly operationCompletionEstablished: false;
  readonly rootCleanupEstablished: false;
  readonly rawCausePublished: false;
}

export interface NativeTwoCycleWorkerCycleStepV1
  extends NativeTwoCycleFailureBindingsV1, CycleStepDetail {
  readonly schema: typeof WORKER_SCHEMA;
  readonly version: 1;
  readonly status: 'cycle_operation_failed';
  readonly workerFailureReceiptDigestHex: string;
  readonly workerRootPhaseV2ReceiptDigestHex: string;
  readonly receiptDigestHex: string;
}

export interface NativeTwoCycleParentCycleStepV1
  extends NativeTwoCycleFailureBindingsV1, CycleStepDetail {
  readonly schema: typeof PARENT_SCHEMA;
  readonly version: 1;
  readonly status: 'cycle_step_diagnostics_validated';
  readonly failureReceiptDigestHex: string;
  readonly workerFailureReceiptDigestHex: string;
  readonly workerRootPhaseV2ReceiptDigestHex: string;
  readonly workerCycleStepReceiptDigestHex: string;
  readonly receiptDigestHex: string;
}

/** Prospective failure discrimination only; neither a success nor execution authority. */
export function createNativeTwoCycleWorkerCycleStepV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  workerFailureText: string,
  workerRootPhaseV2Text: string,
  projection: Readonly<{ cycle: 'cycle-1' | 'cycle-2'; step: NativeTwoCycleCycleStepV1 }>,
): Readonly<NativeTwoCycleWorkerCycleStepV1> {
  const lineage = validateLineage(bindings, workerFailureText, workerRootPhaseV2Text);
  const fields = exactRecord(projection, ['cycle', 'step']);
  const detail = validateDetail(fields.cycle, fields.step, lineage.root.primaryPhase);
  const body = Object.freeze({
    schema: WORKER_SCHEMA, version: 1 as const, status: 'cycle_operation_failed' as const,
    ...lineage.bindings,
    workerFailureReceiptDigestHex: lineage.failure.receiptDigestHex,
    workerRootPhaseV2ReceiptDigestHex: lineage.root.receiptDigestHex,
    ...detail,
  });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, WORKER_DOMAIN) });
}

export function parseNativeTwoCycleWorkerCycleStepV1(
  text: string,
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  workerFailureText: string,
  workerRootPhaseV2Text: string,
): Readonly<NativeTwoCycleWorkerCycleStepV1> {
  const fields = exactRecord(parseText(text), WORKER_KEYS);
  const lineage = validateLineage(bindings, workerFailureText, workerRootPhaseV2Text);
  if (fields.schema !== WORKER_SCHEMA || fields.version !== 1
    || fields.status !== 'cycle_operation_failed'
    || fields.operationCompletionEstablished !== false
    || fields.rootCleanupEstablished !== false || fields.rawCausePublished !== false) {
    throw new Error('native two-cycle step identity or claims differ');
  }
  const detail = validateDetail(fields.cycle, fields.step, lineage.root.primaryPhase);
  const expected = createNativeTwoCycleWorkerCycleStepV1(lineage.bindings,
    workerFailureText, workerRootPhaseV2Text, { cycle: detail.cycle, step: detail.step });
  // Reconstruct from validated ancestors, not the companion's self-declared hashes.
  if (canonicalJson(fields) !== canonicalJson(expected)) {
    throw new Error('native two-cycle step bindings, lineage or digest differ');
  }
  return expected;
}

export function createNativeTwoCycleParentCycleStepV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  failureReceiptDigestHex: string,
  workerFailureText: string,
  workerRootPhaseV2Text: string,
  workerCycleStepText: string,
): Readonly<NativeTwoCycleParentCycleStepV1> {
  const worker = parseNativeTwoCycleWorkerCycleStepV1(workerCycleStepText, bindings,
    workerFailureText, workerRootPhaseV2Text);
  const body = Object.freeze({
    schema: PARENT_SCHEMA, version: 1 as const,
    status: 'cycle_step_diagnostics_validated' as const,
    ...validateBindings(bindings),
    failureReceiptDigestHex: lowerHex(failureReceiptDigestHex, 32),
    workerFailureReceiptDigestHex: worker.workerFailureReceiptDigestHex,
    workerRootPhaseV2ReceiptDigestHex: worker.workerRootPhaseV2ReceiptDigestHex,
    workerCycleStepReceiptDigestHex: worker.receiptDigestHex,
    cycle: worker.cycle, step: worker.step,
    operationCompletionEstablished: false as const,
    rootCleanupEstablished: false as const, rawCausePublished: false as const,
  });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, PARENT_DOMAIN) });
}

export function parseNativeTwoCycleParentCycleStepV1(
  text: string,
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  failureReceiptDigestHex: string,
  workerFailureText: string,
  workerRootPhaseV2Text: string,
  workerCycleStepText: string,
): Readonly<NativeTwoCycleParentCycleStepV1> {
  const expected = createNativeTwoCycleParentCycleStepV1(bindings,
    failureReceiptDigestHex, workerFailureText, workerRootPhaseV2Text, workerCycleStepText);
  if (canonicalJson(parseText(text)) !== canonicalJson(expected)) {
    throw new Error('native two-cycle parent step identity, lineage or digest differ');
  }
  return expected;
}

function validateLineage(bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  workerFailureText: string, workerRootPhaseV2Text: string) {
  const expected = validateBindings(bindings);
  const failure = parseNativeTwoCycleWorkerFailureDiagnosticV1(workerFailureText, expected);
  const root = parseNativeTwoCycleWorkerRootPhaseV2(workerRootPhaseV2Text, expected);
  if (failure.stage !== 'root-or-cleanup'
    || (root.primaryPhase !== 'cycle-1' && root.primaryPhase !== 'cycle-2')) {
    throw new Error('native two-cycle step requires a cycle root failure');
  }
  return { bindings: expected, failure, root };
}

function validateDetail(cycle: unknown, step: unknown, phase: unknown): Readonly<CycleStepDetail> {
  if ((cycle !== 'cycle-1' && cycle !== 'cycle-2') || cycle !== phase) {
    throw new Error('native two-cycle step cycle differs from root phase');
  }
  if (typeof step !== 'string'
    || !NATIVE_TWO_CYCLE_CYCLE_STEPS_V1.includes(step as NativeTwoCycleCycleStepV1)) {
    throw new Error('native two-cycle active step is unsupported');
  }
  return Object.freeze({ cycle, step: step as NativeTwoCycleCycleStepV1,
    operationCompletionEstablished: false, rootCleanupEstablished: false, rawCausePublished: false });
}

function validateBindings(bindings: Readonly<NativeTwoCycleFailureBindingsV1>) {
  const record = exactRecord(bindings, ['configSha256Hex', 'expectedBridgeCommit', 'pathIdentityDigestHex']);
  return Object.freeze({ configSha256Hex: lowerHex(record.configSha256Hex, 32),
    expectedBridgeCommit: lowerHex(record.expectedBridgeCommit, 20),
    pathIdentityDigestHex: lowerHex(record.pathIdentityDigestHex, 32) });
}

function parseText(text: string): unknown {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    throw new Error('native two-cycle step companion is not bounded text');
  }
  assertNoDuplicateJsonKeys(text);
  let value: unknown;
  try { value = JSON.parse(text) as unknown; }
  catch { throw new Error('native two-cycle step companion is invalid JSON'); }
  if (text !== `${canonicalJson(value)}\n`) {
    throw new Error('native two-cycle step companion is not canonical JSON');
  }
  return value;
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('native two-cycle step companion must be an object');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length
    || keys.some(key => !Object.prototype.hasOwnProperty.call(record, key))) {
    throw new Error('native two-cycle step companion fields differ');
  }
  return record;
}

function lowerHex(value: unknown, bytes: number): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)) {
    throw new Error('native two-cycle step hex identity differs');
  }
  return value;
}
