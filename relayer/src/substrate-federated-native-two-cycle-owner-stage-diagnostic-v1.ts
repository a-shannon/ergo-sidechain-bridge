import { assertNoDuplicateJsonKeys, canonicalJson, sha256CanonicalJson }
  from './ergo-settlement-core/strict-json.js';
import { ISOLATED_ERGO_NODE_POST_CALLBACK_STAGES_V1, type IsolatedErgoNodePostCallbackStageV1 }
  from './substrate-federated-isolated-devnet-ergo-node-post-callback-stage-v1.js';
import { type NativeTwoCycleFailureBindingsV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { parseNativeTwoCycleWorkerCycleStepV1 }
  from './substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';

const WORKER_SCHEMA = 'e2s.substrate-federated-native-two-cycle-worker-owner-stage.v1';
const PARENT_SCHEMA = 'e2s.substrate-federated-native-two-cycle-parent-owner-stage.v1';
const WORKER_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_OWNER_STAGE_V1';
const PARENT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_OWNER_STAGE_V1';
const OWNER_OPERATION = 'withMiningActiveExecutionTarget';
const MAX_BYTES = 16 * 1024;
const WORKER_KEYS = [
  'schema', 'version', 'status', 'configSha256Hex', 'expectedBridgeCommit',
  'pathIdentityDigestHex', 'workerFailureReceiptDigestHex',
  'workerRootPhaseV2ReceiptDigestHex', 'workerCycleStepReceiptDigestHex',
  'cycle', 'step', 'ownerOperation', 'ownerStage', 'operationCompletionEstablished',
  'rootCleanupEstablished', 'rawCausePublished', 'receiptDigestHex',
] as const;
const PARENT_KEYS = [...WORKER_KEYS, 'failureReceiptDigestHex',
  'workerOwnerStageReceiptDigestHex'] as const;

interface OwnerStageDetail {
  readonly cycle: 'cycle-1';
  readonly step: 'cycle-summary';
  readonly ownerOperation: typeof OWNER_OPERATION;
  readonly ownerStage: IsolatedErgoNodePostCallbackStageV1;
  readonly operationCompletionEstablished: false;
  readonly rootCleanupEstablished: false;
  readonly rawCausePublished: false;
}

export interface NativeTwoCycleWorkerOwnerStageV1
  extends NativeTwoCycleFailureBindingsV1, OwnerStageDetail {
  readonly schema: typeof WORKER_SCHEMA;
  readonly version: 1;
  readonly status: 'owner_operation_failed';
  readonly workerFailureReceiptDigestHex: string;
  readonly workerRootPhaseV2ReceiptDigestHex: string;
  readonly workerCycleStepReceiptDigestHex: string;
  readonly receiptDigestHex: string;
}

export interface NativeTwoCycleParentOwnerStageV1
  extends NativeTwoCycleFailureBindingsV1, OwnerStageDetail {
  readonly schema: typeof PARENT_SCHEMA;
  readonly version: 1;
  readonly status: 'owner_stage_diagnostics_validated';
  readonly failureReceiptDigestHex: string;
  readonly workerFailureReceiptDigestHex: string;
  readonly workerRootPhaseV2ReceiptDigestHex: string;
  readonly workerCycleStepReceiptDigestHex: string;
  readonly workerOwnerStageReceiptDigestHex: string;
  readonly receiptDigestHex: string;
}

/** Bounded diagnostic self-consistency only; no authentication or execution authority. */
export function createNativeTwoCycleWorkerOwnerStageV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  workerFailureText: string,
  workerRootPhaseV2Text: string,
  workerCycleStepText: string,
  stage: IsolatedErgoNodePostCallbackStageV1,
): Readonly<NativeTwoCycleWorkerOwnerStageV1> {
  const lineage = validateLineage(bindings, workerFailureText,
    workerRootPhaseV2Text, workerCycleStepText);
  const body = Object.freeze({
    schema: WORKER_SCHEMA, version: 1 as const, status: 'owner_operation_failed' as const,
    ...lineage.bindings,
    workerFailureReceiptDigestHex: lineage.cycleStep.workerFailureReceiptDigestHex,
    workerRootPhaseV2ReceiptDigestHex: lineage.cycleStep.workerRootPhaseV2ReceiptDigestHex,
    workerCycleStepReceiptDigestHex: lineage.cycleStep.receiptDigestHex,
    cycle: 'cycle-1' as const, step: 'cycle-summary' as const,
    ownerOperation: OWNER_OPERATION, ownerStage: ownerStage(stage),
    operationCompletionEstablished: false as const,
    rootCleanupEstablished: false as const, rawCausePublished: false as const,
  });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, WORKER_DOMAIN) });
}

export function parseNativeTwoCycleWorkerOwnerStageV1(
  text: string,
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  workerFailureText: string,
  workerRootPhaseV2Text: string,
  workerCycleStepText: string,
): Readonly<NativeTwoCycleWorkerOwnerStageV1> {
  const fields = exactRecord(parseText(text), WORKER_KEYS);
  // Ancestor hashes are reconstructed from exact validated bytes. The stage
  // remains a worker assertion; its digest does not authenticate that assertion.
  const expected = createNativeTwoCycleWorkerOwnerStageV1(bindings,
    workerFailureText, workerRootPhaseV2Text, workerCycleStepText, ownerStage(fields.ownerStage));
  if (canonicalJson(fields) !== canonicalJson(expected)) {
    throw new Error('native two-cycle owner stage identity, claims, lineage or digest differ');
  }
  return expected;
}

/** The terminal digest binds a diagnostic; it does not recreate terminal-failure authority. */
export function createNativeTwoCycleParentOwnerStageV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  failureReceiptDigestHex: string,
  workerFailureText: string,
  workerRootPhaseV2Text: string,
  workerCycleStepText: string,
  workerOwnerStageText: string,
): Readonly<NativeTwoCycleParentOwnerStageV1> {
  const worker = parseNativeTwoCycleWorkerOwnerStageV1(workerOwnerStageText, bindings,
    workerFailureText, workerRootPhaseV2Text, workerCycleStepText);
  const body = Object.freeze({
    schema: PARENT_SCHEMA, version: 1 as const,
    status: 'owner_stage_diagnostics_validated' as const,
    ...validateBindings(bindings),
    failureReceiptDigestHex: lowerHex(failureReceiptDigestHex, 32),
    workerFailureReceiptDigestHex: worker.workerFailureReceiptDigestHex,
    workerRootPhaseV2ReceiptDigestHex: worker.workerRootPhaseV2ReceiptDigestHex,
    workerCycleStepReceiptDigestHex: worker.workerCycleStepReceiptDigestHex,
    workerOwnerStageReceiptDigestHex: worker.receiptDigestHex,
    cycle: worker.cycle, step: worker.step,
    ownerOperation: worker.ownerOperation, ownerStage: worker.ownerStage,
    operationCompletionEstablished: false as const,
    rootCleanupEstablished: false as const, rawCausePublished: false as const,
  });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, PARENT_DOMAIN) });
}

export function parseNativeTwoCycleParentOwnerStageV1(
  text: string,
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  failureReceiptDigestHex: string,
  workerFailureText: string,
  workerRootPhaseV2Text: string,
  workerCycleStepText: string,
  workerOwnerStageText: string,
): Readonly<NativeTwoCycleParentOwnerStageV1> {
  const fields = exactRecord(parseText(text), PARENT_KEYS);
  const expected = createNativeTwoCycleParentOwnerStageV1(bindings,
    failureReceiptDigestHex, workerFailureText, workerRootPhaseV2Text,
    workerCycleStepText, workerOwnerStageText);
  if (canonicalJson(fields) !== canonicalJson(expected)) {
    throw new Error('native two-cycle parent owner stage identity, claims, lineage or digest differ');
  }
  return expected;
}

function validateLineage(bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  workerFailureText: string, workerRootPhaseV2Text: string, workerCycleStepText: string) {
  const expected = validateBindings(bindings);
  const cycleStep = parseNativeTwoCycleWorkerCycleStepV1(workerCycleStepText, expected,
    workerFailureText, workerRootPhaseV2Text);
  if (cycleStep.cycle !== 'cycle-1' || cycleStep.step !== 'cycle-summary') {
    throw new Error('native two-cycle owner stage requires cycle-1 cycle-summary');
  }
  return { bindings: expected, cycleStep };
}

function ownerStage(value: unknown): IsolatedErgoNodePostCallbackStageV1 {
  if (typeof value !== 'string'
    || !ISOLATED_ERGO_NODE_POST_CALLBACK_STAGES_V1.includes(value as IsolatedErgoNodePostCallbackStageV1)) {
    throw new Error('native two-cycle owner stage is unsupported');
  }
  return value as IsolatedErgoNodePostCallbackStageV1;
}

function validateBindings(bindings: Readonly<NativeTwoCycleFailureBindingsV1>) {
  const record = exactRecord(bindings, ['configSha256Hex', 'expectedBridgeCommit', 'pathIdentityDigestHex']);
  return Object.freeze({ configSha256Hex: lowerHex(record.configSha256Hex, 32),
    expectedBridgeCommit: lowerHex(record.expectedBridgeCommit, 20),
    pathIdentityDigestHex: lowerHex(record.pathIdentityDigestHex, 32) });
}

function parseText(text: string): unknown {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    throw new Error('native two-cycle owner stage companion is not bounded text');
  }
  assertNoDuplicateJsonKeys(text);
  let value: unknown;
  try { value = JSON.parse(text) as unknown; }
  catch { throw new Error('native two-cycle owner stage companion is invalid JSON'); }
  if (text !== `${canonicalJson(value)}\n`) {
    throw new Error('native two-cycle owner stage companion is not canonical JSON');
  }
  return value;
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('native two-cycle owner stage companion must be an object');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length
    || keys.some(key => !Object.prototype.hasOwnProperty.call(record, key))) {
    throw new Error('native two-cycle owner stage companion fields differ');
  }
  return record;
}

function lowerHex(value: unknown, bytes: number): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)) {
    throw new Error('native two-cycle owner stage hex identity differs');
  }
  return value;
}
