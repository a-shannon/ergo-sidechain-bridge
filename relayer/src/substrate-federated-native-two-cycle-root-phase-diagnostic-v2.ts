import {
  assertNoDuplicateJsonKeys,
  canonicalJson,
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  parseNativeTwoCycleWorkerFailureDiagnosticV1,
  type NativeTwoCycleFailureBindingsV1,
} from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import {
  SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_ROOT_PHASES_V1,
  type SubstrateFederatedNativeTwoCycleRootPhaseV1,
} from './substrate-federated-native-two-cycle-root-phase-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_STARTUP_PHASES_V1,
  type SubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseV1,
} from './relayer-core/substrate-federated-isolated-devnet-managed-campaign-phase-v1.js';
import type {
  SubstrateFederatedNativeTwoCycleRootFailurePhaseV2,
} from './substrate-federated-native-two-cycle-root-phase-v2.js';

const WORKER_SCHEMA = 'e2s.substrate-federated-native-two-cycle-worker-root-phase.v2';
const PARENT_SCHEMA = 'e2s.substrate-federated-native-two-cycle-parent-root-phase.v2';
const WORKER_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_ROOT_PHASE_V2';
const PARENT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_ROOT_PHASE_V2';
const MAX_COMPANION_BYTES = 16 * 1024;

export interface NativeTwoCycleWorkerRootPhaseV2 extends NativeTwoCycleFailureBindingsV1 {
  readonly schema: typeof WORKER_SCHEMA;
  readonly version: 2;
  readonly status: 'root_failed';
  readonly primaryPhase: SubstrateFederatedNativeTwoCycleRootPhaseV1 | null;
  readonly cleanupErrorCount: number;
  readonly ergoNodeStartupPhase: SubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseV1 | null;
  readonly rootCleanupEstablished: false;
  readonly rawCausePublished: false;
  readonly receiptDigestHex: string;
}

export interface NativeTwoCycleParentRootPhaseV2 extends NativeTwoCycleFailureBindingsV1 {
  readonly schema: typeof PARENT_SCHEMA;
  readonly version: 2;
  readonly status: 'root_phase_diagnostics_validated';
  readonly failureReceiptDigestHex: string;
  readonly workerFailureReceiptDigestHex: string;
  readonly workerRootPhaseV2ReceiptDigestHex: string;
  readonly primaryPhase: SubstrateFederatedNativeTwoCycleRootPhaseV1 | null;
  readonly cleanupErrorCount: number;
  readonly ergoNodeStartupPhase: SubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseV1 | null;
  readonly rootCleanupEstablished: false;
  readonly rawCausePublished: false;
  readonly receiptDigestHex: string;
}

export function createNativeTwoCycleWorkerRootPhaseV2(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  projection: Readonly<SubstrateFederatedNativeTwoCycleRootFailurePhaseV2>,
): Readonly<NativeTwoCycleWorkerRootPhaseV2> {
  const body = Object.freeze({
    schema: WORKER_SCHEMA,
    version: 2 as const,
    status: 'root_failed' as const,
    ...validateBindings(bindings),
    ...validateProjection(projection),
    rootCleanupEstablished: false as const,
    rawCausePublished: false as const,
  });
  return Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, WORKER_DOMAIN),
  });
}

export function parseNativeTwoCycleWorkerRootPhaseV2(
  text: string,
  expectedBindings: Readonly<NativeTwoCycleFailureBindingsV1>,
): Readonly<NativeTwoCycleWorkerRootPhaseV2> {
  return validateWorker(parseCompanion(text), expectedBindings);
}

export function createNativeTwoCycleParentRootPhaseV2(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  failureReceiptDigestHex: string,
  workerFailureText: string,
  workerRootPhase: Readonly<NativeTwoCycleWorkerRootPhaseV2>,
): Readonly<NativeTwoCycleParentRootPhaseV2> {
  const expected = validateBindings(bindings);
  const workerFailure = parseNativeTwoCycleWorkerFailureDiagnosticV1(
    workerFailureText, expected,
  );
  if (workerFailure.stage !== 'root-or-cleanup') {
    throw new Error('native two-cycle V2 root phase requires root-or-cleanup worker stage');
  }
  assertMatchingBindings(workerFailure, expected);
  const rootPhase = validateWorker(workerRootPhase, expected);
  const body = Object.freeze({
    schema: PARENT_SCHEMA,
    version: 2 as const,
    status: 'root_phase_diagnostics_validated' as const,
    ...expected,
    failureReceiptDigestHex: lowerHex(failureReceiptDigestHex, 32),
    workerFailureReceiptDigestHex: lowerHex(workerFailure.receiptDigestHex, 32),
    workerRootPhaseV2ReceiptDigestHex: rootPhase.receiptDigestHex,
    primaryPhase: rootPhase.primaryPhase,
    cleanupErrorCount: rootPhase.cleanupErrorCount,
    ergoNodeStartupPhase: rootPhase.ergoNodeStartupPhase,
    rootCleanupEstablished: false as const,
    rawCausePublished: false as const,
  });
  return Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, PARENT_DOMAIN),
  });
}

function parseCompanion(text: string): unknown {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_COMPANION_BYTES) {
    throw new Error('native two-cycle V2 root phase companion is not bounded text');
  }
  assertNoDuplicateJsonKeys(text);
  let value: unknown;
  try { value = JSON.parse(text) as unknown; }
  catch { throw new Error('native two-cycle V2 root phase companion is invalid JSON'); }
  if (text !== `${canonicalJson(value)}\n`) {
    throw new Error('native two-cycle V2 root phase companion is not canonical JSON');
  }
  return value;
}

function validateWorker(
  value: unknown,
  expectedBindings: Readonly<NativeTwoCycleFailureBindingsV1>,
): Readonly<NativeTwoCycleWorkerRootPhaseV2> {
  const record = exactRecord(value, [
    'schema', 'version', 'status', 'configSha256Hex', 'expectedBridgeCommit',
    'pathIdentityDigestHex', 'primaryPhase', 'cleanupErrorCount',
    'ergoNodeStartupPhase', 'rootCleanupEstablished', 'rawCausePublished',
    'receiptDigestHex',
  ]);
  if (record.schema !== WORKER_SCHEMA || record.version !== 2
    || record.status !== 'root_failed' || record.rootCleanupEstablished !== false
    || record.rawCausePublished !== false) {
    throw new Error('native two-cycle V2 root phase companion identity differs');
  }
  const bindings = validateBindings({
    configSha256Hex: record.configSha256Hex,
    expectedBridgeCommit: record.expectedBridgeCommit,
    pathIdentityDigestHex: record.pathIdentityDigestHex,
  });
  assertMatchingBindings(bindings, validateBindings(expectedBindings));
  const projection = validateProjection({
    primaryPhase: record.primaryPhase,
    cleanupErrorCount: record.cleanupErrorCount,
    ergoNodeStartupPhase: record.ergoNodeStartupPhase,
  });
  const receiptDigestHex = lowerHex(record.receiptDigestHex, 32);
  const { receiptDigestHex: ignored, ...body } = record;
  void ignored;
  if (receiptDigestHex !== sha256CanonicalJson(body, WORKER_DOMAIN)) {
    throw new Error('native two-cycle V2 root phase companion digest differs');
  }
  return Object.freeze({
    schema: WORKER_SCHEMA, version: 2, status: 'root_failed', ...bindings,
    ...projection, rootCleanupEstablished: false, rawCausePublished: false,
    receiptDigestHex,
  });
}

function validateProjection(value: Readonly<{
  primaryPhase: unknown;
  cleanupErrorCount: unknown;
  ergoNodeStartupPhase: unknown;
}>): Readonly<{
  primaryPhase: SubstrateFederatedNativeTwoCycleRootPhaseV1 | null;
  cleanupErrorCount: number;
  ergoNodeStartupPhase: SubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseV1 | null;
}> {
  const phase = value.primaryPhase;
  if (phase !== null && (typeof phase !== 'string'
    || phase === 'cleanup'
    || !SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_ROOT_PHASES_V1.includes(
      phase as SubstrateFederatedNativeTwoCycleRootPhaseV1))) {
    throw new Error('native two-cycle V2 root primary phase is unsupported');
  }
  const count = value.cleanupErrorCount;
  if (!Number.isSafeInteger(count) || Number(count) < 0 || Number(count) > 32) {
    throw new Error('native two-cycle V2 root cleanup exception count differs');
  }
  const startupPhase = value.ergoNodeStartupPhase;
  if (startupPhase !== null && (typeof startupPhase !== 'string'
    || !SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_STARTUP_PHASES_V1.includes(
      startupPhase as SubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseV1))) {
    throw new Error('native two-cycle Ergo startup phase is unsupported');
  }
  if (phase !== 'node-start' && startupPhase !== null) {
    throw new Error('native two-cycle Ergo startup phase requires node-start');
  }
  return Object.freeze({
    primaryPhase: phase as SubstrateFederatedNativeTwoCycleRootPhaseV1 | null,
    cleanupErrorCount: count as number,
    ergoNodeStartupPhase:
      startupPhase as SubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseV1 | null,
  });
}

function validateBindings(value: Readonly<{
  configSha256Hex: unknown;
  expectedBridgeCommit: unknown;
  pathIdentityDigestHex: unknown;
}>): Readonly<NativeTwoCycleFailureBindingsV1> {
  return Object.freeze({
    configSha256Hex: lowerHex(value.configSha256Hex, 32),
    expectedBridgeCommit: lowerHex(value.expectedBridgeCommit, 20),
    pathIdentityDigestHex: lowerHex(value.pathIdentityDigestHex, 32),
  });
}

function assertMatchingBindings(
  actual: Readonly<NativeTwoCycleFailureBindingsV1>,
  expected: Readonly<NativeTwoCycleFailureBindingsV1>,
): void {
  if (actual.configSha256Hex !== expected.configSha256Hex
    || actual.expectedBridgeCommit !== expected.expectedBridgeCommit
    || actual.pathIdentityDigestHex !== expected.pathIdentityDigestHex) {
    throw new Error('native two-cycle V2 root phase bindings differ');
  }
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('native two-cycle V2 root phase companion must be an object');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length
    || keys.some(key => !Object.prototype.hasOwnProperty.call(record, key))) {
    throw new Error('native two-cycle V2 root phase companion fields differ');
  }
  return record;
}

function lowerHex(value: unknown, bytes: number): string {
  if (typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)) {
    throw new Error('native two-cycle V2 root phase hex identity differs');
  }
  return value;
}
