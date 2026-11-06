import { types } from 'node:util';

import { assertNoDuplicateJsonKeys, canonicalJson, sha256CanonicalJson }
  from './ergo-settlement-core/strict-json.js';
import { NATIVE_DEPOSIT_FUNDING_SUBSTAGES_V1,
  type NativeDepositFundingSubstageV1 }
  from './substrate-federated-native-deposit-funding-substage-v1.js';
import type { NativeTwoCycleFailureBindingsV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { parseNativeTwoCycleWorkerFailureDiagnosticV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import type { NativeTwoCycleFailureStageV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { parseNativeTwoCycleWorkerRootPhaseV2 }
  from './substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';
import { parseNativeTwoCycleWorkerCycleStepV1 }
  from './substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { parseNativeTwoCycleParentCycleStepV1 }
  from './substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 }
  from './substrate-federated-native-two-cycle-root-phase-v1.js';
import { projectOwnNativeTwoCycleCycleStepFailureV1 }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';

export const NATIVE_DEPOSIT_FUNDING_STAGE_V2_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-deposit-funding-stage.v2' as const;
export const NATIVE_DEPOSIT_FUNDING_STAGE_V2_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_DEPOSIT_FUNDING_STAGE_V2' as const;
export const NATIVE_DEPOSIT_FUNDING_WORKER_STAGE_V2_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-worker-deposit-funding-stage.v2' as const;
export const NATIVE_DEPOSIT_FUNDING_WORKER_STAGE_V2_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_DEPOSIT_FUNDING_STAGE_V2' as const;
export const NATIVE_DEPOSIT_FUNDING_PARENT_STAGE_V2_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-parent-deposit-funding-stage.v2' as const;
export const NATIVE_DEPOSIT_FUNDING_PARENT_STAGE_V2_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_DEPOSIT_FUNDING_STAGE_V2' as const;
const MAX_BYTES = 16 * 1024;
const BINDING_KEYS = ['configSha256Hex', 'expectedBridgeCommit',
  'pathIdentityDigestHex'] as const;
const OBSERVATION_KEYS = ['cycle', 'lastEnteredStage'] as const;
const RECORD_KEYS = ['schema', 'version', 'status', ...BINDING_KEYS,
  'failureReceiptDigestHex', ...OBSERVATION_KEYS, 'step',
  'operationCompletionEstablished', 'rootCleanupEstablished',
  'rawCausePublished', 'stageCauseEstablished', 'campaignAdmitted',
  'receiptDigestHex'] as const;
const WORKER_LINEAGE_KEYS = ['workerFailureText', 'workerRootPhaseV2Text',
  'workerCycleStepText'] as const;
const WORKER_RECORD_KEYS = ['schema', 'version', 'status', ...BINDING_KEYS,
  'workerFailureReceiptDigestHex', 'workerRootPhaseV2ReceiptDigestHex',
  'workerCycleStepReceiptDigestHex', ...OBSERVATION_KEYS, 'step',
  'operationCompletionEstablished', 'rootCleanupEstablished',
  'rawCausePublished', 'stageCauseEstablished', 'campaignAdmitted',
  'receiptDigestHex'] as const;
const PARENT_LINEAGE_KEYS = [...WORKER_LINEAGE_KEYS, 'parentCycleStepText',
  'workerDepositFundingStageV2Text'] as const;
const PARENT_RECORD_KEYS = ['schema', 'version', 'status', ...BINDING_KEYS,
  'failureReceiptDigestHex', 'workerFailureReceiptDigestHex',
  'workerRootPhaseV2ReceiptDigestHex', 'workerCycleStepReceiptDigestHex',
  'parentCycleStepReceiptDigestHex', 'workerDepositFundingStageV2ReceiptDigestHex',
  ...OBSERVATION_KEYS, 'step', 'operationCompletionEstablished',
  'rootCleanupEstablished', 'rawCausePublished', 'stageCauseEstablished',
  'campaignAdmitted', 'receiptDigestHex'] as const;

export type NativeDepositFundingCycleV2 = 'cycle-1' | 'cycle-2';
export type NativeDepositFundingStageObserverV2 =
  (cycle: NativeDepositFundingCycleV2,
    stage: NativeDepositFundingSubstageV1 | null) => void;

export interface NativeDepositFundingStageObservationV2 {
  readonly cycle: NativeDepositFundingCycleV2;
  readonly lastEnteredStage: NativeDepositFundingSubstageV1;
}

export interface NativeDepositFundingStageV2
  extends NativeTwoCycleFailureBindingsV1, NativeDepositFundingStageObservationV2 {
  readonly schema: typeof NATIVE_DEPOSIT_FUNDING_STAGE_V2_SCHEMA;
  readonly version: 2;
  readonly status: 'last_entered_stage_observed';
  readonly failureReceiptDigestHex: string;
  readonly step: 'deposit-funding';
  readonly operationCompletionEstablished: false;
  readonly rootCleanupEstablished: false;
  readonly rawCausePublished: false;
  readonly stageCauseEstablished: false;
  readonly campaignAdmitted: false;
  readonly receiptDigestHex: string;
}

export interface NativeDepositFundingWorkerStageLineageV2 {
  readonly workerFailureText: string;
  readonly workerRootPhaseV2Text: string;
  readonly workerCycleStepText: string;
}

export interface NativeDepositFundingWorkerStageV2
  extends NativeTwoCycleFailureBindingsV1, NativeDepositFundingStageObservationV2 {
  readonly schema: typeof NATIVE_DEPOSIT_FUNDING_WORKER_STAGE_V2_SCHEMA;
  readonly version: 2;
  readonly status: 'last_entered_stage_observed';
  readonly workerFailureReceiptDigestHex: string;
  readonly workerRootPhaseV2ReceiptDigestHex: string;
  readonly workerCycleStepReceiptDigestHex: string;
  readonly step: 'deposit-funding';
  readonly operationCompletionEstablished: false;
  readonly rootCleanupEstablished: false;
  readonly rawCausePublished: false;
  readonly stageCauseEstablished: false;
  readonly campaignAdmitted: false;
  readonly receiptDigestHex: string;
}

export interface NativeDepositFundingParentStageLineageV2
  extends NativeDepositFundingWorkerStageLineageV2 {
  readonly parentCycleStepText: string;
  readonly workerDepositFundingStageV2Text: string;
}

export interface NativeDepositFundingParentStageV2
  extends NativeTwoCycleFailureBindingsV1, NativeDepositFundingStageObservationV2 {
  readonly schema: typeof NATIVE_DEPOSIT_FUNDING_PARENT_STAGE_V2_SCHEMA;
  readonly version: 2;
  readonly status: 'last_entered_stage_observed';
  readonly failureReceiptDigestHex: string;
  readonly workerFailureReceiptDigestHex: string;
  readonly workerRootPhaseV2ReceiptDigestHex: string;
  readonly workerCycleStepReceiptDigestHex: string;
  readonly parentCycleStepReceiptDigestHex: string;
  readonly workerDepositFundingStageV2ReceiptDigestHex: string;
  readonly step: 'deposit-funding';
  readonly operationCompletionEstablished: false;
  readonly rootCleanupEstablished: false;
  readonly rawCausePublished: false;
  readonly stageCauseEstablished: false;
  readonly campaignAdmitted: false;
  readonly receiptDigestHex: string;
}

function fail(): never {
  throw new Error('native deposit funding stage V2 identity or canonical bytes differ');
}

function exactOwnData(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (types.isProxy(value) || value === null || typeof value !== 'object'
      || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some(key => typeof key !== 'string'
      || !keys.includes(key))) fail();
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail();
    result[key] = descriptor.value;
  }
  return result;
}

function lowerHex(value: unknown, bytes: number): string {
  if (typeof value !== 'string' || value.length !== bytes * 2
      || !/^[0-9a-f]+$/u.test(value)) fail();
  return value;
}

function bindings(value: unknown): Readonly<NativeTwoCycleFailureBindingsV1> {
  const raw = exactOwnData(value, BINDING_KEYS);
  return Object.freeze({
    configSha256Hex: lowerHex(raw.configSha256Hex, 32),
    expectedBridgeCommit: lowerHex(raw.expectedBridgeCommit, 20),
    pathIdentityDigestHex: lowerHex(raw.pathIdentityDigestHex, 32),
  });
}

function observation(value: unknown): Readonly<NativeDepositFundingStageObservationV2> {
  const raw = exactOwnData(value, OBSERVATION_KEYS);
  if (raw.cycle !== 'cycle-1' && raw.cycle !== 'cycle-2') fail();
  if (typeof raw.lastEnteredStage !== 'string'
      || !NATIVE_DEPOSIT_FUNDING_SUBSTAGES_V1.includes(
        raw.lastEnteredStage as NativeDepositFundingSubstageV1)) fail();
  return Object.freeze({ cycle: raw.cycle,
    lastEnteredStage: raw.lastEnteredStage as NativeDepositFundingSubstageV1 });
}

export function createNativeDepositFundingStageV2(
  expectedBindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  failureReceiptDigestHex: string,
  expectedObservation: Readonly<NativeDepositFundingStageObservationV2>,
): Readonly<NativeDepositFundingStageV2> {
  const selectedBindings = bindings(expectedBindings);
  const selectedObservation = observation(expectedObservation);
  const body = Object.freeze({
    schema: NATIVE_DEPOSIT_FUNDING_STAGE_V2_SCHEMA,
    version: 2 as const,
    status: 'last_entered_stage_observed' as const,
    ...selectedBindings,
    failureReceiptDigestHex: lowerHex(failureReceiptDigestHex, 32),
    ...selectedObservation,
    step: 'deposit-funding' as const,
    operationCompletionEstablished: false as const,
    rootCleanupEstablished: false as const,
    rawCausePublished: false as const,
    stageCauseEstablished: false as const,
    campaignAdmitted: false as const,
  });
  return Object.freeze({ ...body,
    receiptDigestHex: sha256CanonicalJson(body, NATIVE_DEPOSIT_FUNDING_STAGE_V2_DOMAIN) });
}

export function encodeNativeDepositFundingStageV2(
  expectedBindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  failureReceiptDigestHex: string,
  expectedObservation: Readonly<NativeDepositFundingStageObservationV2>,
): Uint8Array {
  const bytes = Buffer.from(canonicalJson(createNativeDepositFundingStageV2(
    expectedBindings, failureReceiptDigestHex, expectedObservation)) + '\n', 'utf8');
  if (bytes.length > MAX_BYTES) fail();
  return bytes;
}

export function parseNativeDepositFundingStageV2(
  bytes: Uint8Array,
  expectedBindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  failureReceiptDigestHex: string,
  expectedObservation: Readonly<NativeDepositFundingStageObservationV2>,
): Readonly<NativeDepositFundingStageV2> {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_BYTES) fail();
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail();
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail(); }
  if (text.charCodeAt(0) === 0xfeff || text.includes('\r') || !text.endsWith('\n')) fail();
  let parsed: unknown;
  try { assertNoDuplicateJsonKeys(text); parsed = JSON.parse(text) as unknown; }
  catch { fail(); }
  const record = exactOwnData(parsed, RECORD_KEYS);
  if (canonicalJson(record) + '\n' !== text) fail();
  const expected = createNativeDepositFundingStageV2(
    expectedBindings, failureReceiptDigestHex, expectedObservation);
  if (canonicalJson(record) !== canonicalJson(expected)) fail();
  return expected;
}

export function createNativeDepositFundingWorkerStageV2(
  expectedBindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  lineage: Readonly<NativeDepositFundingWorkerStageLineageV2>,
  expectedObservation: Readonly<NativeDepositFundingStageObservationV2>,
): Readonly<NativeDepositFundingWorkerStageV2> {
  const selectedBindings = bindings(expectedBindings);
  const selectedObservation = observation(expectedObservation);
  const selectedLineage = exactOwnData(lineage, WORKER_LINEAGE_KEYS);
  if (WORKER_LINEAGE_KEYS.some(key => typeof selectedLineage[key] !== 'string')) fail();
  const failure = parseNativeTwoCycleWorkerFailureDiagnosticV1(
    selectedLineage.workerFailureText as string, selectedBindings);
  const root = parseNativeTwoCycleWorkerRootPhaseV2(
    selectedLineage.workerRootPhaseV2Text as string, selectedBindings);
  const step = parseNativeTwoCycleWorkerCycleStepV1(
    selectedLineage.workerCycleStepText as string, selectedBindings,
    selectedLineage.workerFailureText as string,
    selectedLineage.workerRootPhaseV2Text as string);
  if (failure.stage !== 'root-or-cleanup' || root.cleanupErrorCount !== 0
      || root.primaryPhase !== selectedObservation.cycle
      || step.cycle !== selectedObservation.cycle || step.step !== 'deposit-funding') fail();
  const body = Object.freeze({
    schema: NATIVE_DEPOSIT_FUNDING_WORKER_STAGE_V2_SCHEMA,
    version: 2 as const,
    status: 'last_entered_stage_observed' as const,
    ...selectedBindings,
    workerFailureReceiptDigestHex: failure.receiptDigestHex,
    workerRootPhaseV2ReceiptDigestHex: root.receiptDigestHex,
    workerCycleStepReceiptDigestHex: step.receiptDigestHex,
    ...selectedObservation,
    step: 'deposit-funding' as const,
    operationCompletionEstablished: false as const,
    rootCleanupEstablished: false as const,
    rawCausePublished: false as const,
    stageCauseEstablished: false as const,
    campaignAdmitted: false as const,
  });
  return Object.freeze({ ...body,
    receiptDigestHex: sha256CanonicalJson(body,
      NATIVE_DEPOSIT_FUNDING_WORKER_STAGE_V2_DOMAIN) });
}

export function parseNativeDepositFundingWorkerStageV2(
  bytes: Uint8Array,
  expectedBindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  lineage: Readonly<NativeDepositFundingWorkerStageLineageV2>,
  expectedObservation: Readonly<NativeDepositFundingStageObservationV2>,
): Readonly<NativeDepositFundingWorkerStageV2> {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_BYTES
      || (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) fail();
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail(); }
  if (text.charCodeAt(0) === 0xfeff || text.includes('\r') || !text.endsWith('\n')) fail();
  let parsed: unknown;
  try { assertNoDuplicateJsonKeys(text); parsed = JSON.parse(text) as unknown; }
  catch { fail(); }
  const record = exactOwnData(parsed, WORKER_RECORD_KEYS);
  if (canonicalJson(record) + '\n' !== text) fail();
  const expected = createNativeDepositFundingWorkerStageV2(
    expectedBindings, lineage, expectedObservation);
  if (canonicalJson(record) !== canonicalJson(expected)) fail();
  return expected;
}

/** Select a finite worker observation only from the original ordinary failure. */
export function selectNativeDepositFundingWorkerStageV2(
  primaryFailure: unknown,
  workerStage: NativeTwoCycleFailureStageV1,
  selectedLatch: Readonly<NativeDepositFundingStageObservationV2> | null,
  expectedBindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  lineage: Readonly<NativeDepositFundingWorkerStageLineageV2>,
): Readonly<NativeDepositFundingWorkerStageV2> | null {
  try {
    if (workerStage !== 'root-or-cleanup' || selectedLatch === null
        || types.isProxy(primaryFailure) || !types.isNativeError(primaryFailure)
        || !(primaryFailure instanceof Error)
        || primaryFailure instanceof AggregateError) return null;
    const selected = observation(selectedLatch);
    const ownRoot = projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(
      primaryFailure);
    const ownStep = projectOwnNativeTwoCycleCycleStepFailureV1(primaryFailure);
    if (ownRoot !== selected.cycle || ownStep === null
        || ownStep.cycle !== selected.cycle || ownStep.step !== 'deposit-funding') return null;
    return createNativeDepositFundingWorkerStageV2(
      expectedBindings, lineage, selected);
  } catch { return null; }
}

export function createNativeDepositFundingParentStageV2(
  expectedBindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  failureReceiptDigestHex: string,
  lineage: Readonly<NativeDepositFundingParentStageLineageV2>,
): Readonly<NativeDepositFundingParentStageV2> {
  const selectedBindings = bindings(expectedBindings);
  const selectedLineage = exactOwnData(lineage, PARENT_LINEAGE_KEYS);
  if (PARENT_LINEAGE_KEYS.some(key => typeof selectedLineage[key] !== 'string')) fail();
  const workerLineage = Object.freeze({
    workerFailureText: selectedLineage.workerFailureText as string,
    workerRootPhaseV2Text: selectedLineage.workerRootPhaseV2Text as string,
    workerCycleStepText: selectedLineage.workerCycleStepText as string,
  });
  const parentStep = parseNativeTwoCycleParentCycleStepV1(
    selectedLineage.parentCycleStepText as string, selectedBindings,
    lowerHex(failureReceiptDigestHex, 32), workerLineage.workerFailureText,
    workerLineage.workerRootPhaseV2Text, workerLineage.workerCycleStepText);
  const workerText = selectedLineage.workerDepositFundingStageV2Text as string;
  if (Buffer.byteLength(workerText, 'utf8') > MAX_BYTES) fail();
  let rawWorker: unknown;
  try { assertNoDuplicateJsonKeys(workerText); rawWorker = JSON.parse(workerText) as unknown; }
  catch { fail(); }
  const workerFields = exactOwnData(rawWorker, WORKER_RECORD_KEYS);
  const selectedObservation = observation({
    cycle: workerFields.cycle, lastEnteredStage: workerFields.lastEnteredStage });
  const worker = parseNativeDepositFundingWorkerStageV2(
    Buffer.from(workerText, 'utf8'), selectedBindings, workerLineage, selectedObservation);
  if (parentStep.cycle !== worker.cycle || parentStep.step !== 'deposit-funding'
      || parentStep.workerCycleStepReceiptDigestHex !== worker.workerCycleStepReceiptDigestHex
      || parentStep.workerFailureReceiptDigestHex !== worker.workerFailureReceiptDigestHex
      || parentStep.workerRootPhaseV2ReceiptDigestHex !== worker.workerRootPhaseV2ReceiptDigestHex) fail();
  const body = Object.freeze({
    schema: NATIVE_DEPOSIT_FUNDING_PARENT_STAGE_V2_SCHEMA,
    version: 2 as const,
    status: 'last_entered_stage_observed' as const,
    ...selectedBindings,
    failureReceiptDigestHex: parentStep.failureReceiptDigestHex,
    workerFailureReceiptDigestHex: worker.workerFailureReceiptDigestHex,
    workerRootPhaseV2ReceiptDigestHex: worker.workerRootPhaseV2ReceiptDigestHex,
    workerCycleStepReceiptDigestHex: worker.workerCycleStepReceiptDigestHex,
    parentCycleStepReceiptDigestHex: parentStep.receiptDigestHex,
    workerDepositFundingStageV2ReceiptDigestHex: worker.receiptDigestHex,
    cycle: worker.cycle,
    step: 'deposit-funding' as const,
    lastEnteredStage: worker.lastEnteredStage,
    operationCompletionEstablished: false as const,
    rootCleanupEstablished: false as const,
    rawCausePublished: false as const,
    stageCauseEstablished: false as const,
    campaignAdmitted: false as const,
  });
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body,
    NATIVE_DEPOSIT_FUNDING_PARENT_STAGE_V2_DOMAIN) });
}

export function parseNativeDepositFundingParentStageV2(
  bytes: Uint8Array,
  expectedBindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  failureReceiptDigestHex: string,
  lineage: Readonly<NativeDepositFundingParentStageLineageV2>,
): Readonly<NativeDepositFundingParentStageV2> {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_BYTES
      || (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) fail();
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail(); }
  if (text.charCodeAt(0) === 0xfeff || text.includes('\r') || !text.endsWith('\n')) fail();
  let parsed: unknown;
  try { assertNoDuplicateJsonKeys(text); parsed = JSON.parse(text) as unknown; }
  catch { fail(); }
  const record = exactOwnData(parsed, PARENT_RECORD_KEYS);
  if (canonicalJson(record) + '\n' !== text) fail();
  const expected = createNativeDepositFundingParentStageV2(
    expectedBindings, failureReceiptDigestHex, lineage);
  if (canonicalJson(record) !== canonicalJson(expected)) fail();
  return expected;
}
