import {
  assertNoDuplicateJsonKeys,
  canonicalJson,
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_SOURCE_FAILURE_PHASES_V1,
  projectSubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1,
  type SubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1,
} from './relayer-core/substrate-federated-authority-safe-devnet-source-failure-phase-v1.js';

const WORKER_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-worker-failure-diagnostic.v1';
const PARENT_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-parent-failure-diagnostic.v1';
const WORKER_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_FAILURE_DIAGNOSTIC_V1';
const PARENT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_FAILURE_DIAGNOSTIC_V1';
const MAX_WORKER_DIAGNOSTIC_BYTES = 16 * 1024;

export interface NativeTwoCycleFailureBindingsV1 {
  readonly configSha256Hex: string;
  readonly expectedBridgeCommit: string;
  readonly pathIdentityDigestHex: string;
}

export const NATIVE_TWO_CYCLE_FAILURE_STAGES_V1 = Object.freeze([
  'pre-root',
  'root-or-cleanup',
  'projection',
  'post-root-identity',
  'transport-publication',
] as const);

export type NativeTwoCycleFailureStageV1 =
  typeof NATIVE_TWO_CYCLE_FAILURE_STAGES_V1[number];

export interface NativeTwoCycleWorkerFailureDiagnosticV1
  extends NativeTwoCycleFailureBindingsV1 {
  readonly schema: typeof WORKER_SCHEMA;
  readonly version: 1;
  readonly status: 'worker_failed';
  readonly stage: NativeTwoCycleFailureStageV1;
  readonly sourceFailurePhase:
    SubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1 | null;
  readonly rootCleanupEstablished: false;
  readonly rawCausePublished: false;
  readonly receiptDigestHex: string;
}

export interface NativeTwoCycleParentFailureDiagnosticV1
  extends NativeTwoCycleFailureBindingsV1 {
  readonly schema: typeof PARENT_SCHEMA;
  readonly version: 1;
  readonly status: 'worker_failure_diagnostic_validated';
  readonly failureReceiptDigestHex: string;
  readonly workerFailureReceiptDigestHex: string;
  readonly stage: NativeTwoCycleFailureStageV1;
  readonly sourceFailurePhase:
    SubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1 | null;
  readonly rootCleanupEstablished: false;
  readonly rawCausePublished: false;
  readonly receiptDigestHex: string;
}

export function createNativeTwoCycleWorkerFailureDiagnosticV1(
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  stage: NativeTwoCycleFailureStageV1,
  cause: unknown,
): Readonly<NativeTwoCycleWorkerFailureDiagnosticV1> {
  const validatedBindings = validateBindings(bindings, 'worker failure bindings');
  const validatedStage = failureStage(stage);
  const sourceFailurePhase = validatedStage === 'root-or-cleanup'
    ? projectSubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1(cause)
    : null;
  const body = Object.freeze({
    schema: WORKER_SCHEMA,
    version: 1 as const,
    status: 'worker_failed' as const,
    ...validatedBindings,
    stage: validatedStage,
    sourceFailurePhase,
    rootCleanupEstablished: false as const,
    rawCausePublished: false as const,
  });
  return Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, WORKER_DIGEST_DOMAIN),
  });
}

export function parseNativeTwoCycleWorkerFailureDiagnosticV1(
  text: string,
  expectedBindings: Readonly<NativeTwoCycleFailureBindingsV1>,
): Readonly<NativeTwoCycleWorkerFailureDiagnosticV1> {
  if (typeof text !== 'string') {
    throw new Error('native two-cycle worker failure diagnostic must be text');
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_WORKER_DIAGNOSTIC_BYTES) {
    throw new Error('native two-cycle worker failure diagnostic exceeds 16 KiB');
  }
  assertNoDuplicateJsonKeys(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('native two-cycle worker failure diagnostic is invalid JSON');
  }
  if (text !== `${canonicalJson(parsed)}\n`) {
    throw new Error(
      'native two-cycle worker failure diagnostic must be canonical JSON plus one LF',
    );
  }
  return validateWorkerDiagnostic(parsed, expectedBindings);
}

export function createNativeTwoCycleParentFailureDiagnosticV1(
  expectedBindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  failureReceiptDigestHex: string,
  workerDiagnostic: unknown,
): Readonly<NativeTwoCycleParentFailureDiagnosticV1> {
  const bindings = validateBindings(expectedBindings, 'parent failure bindings');
  const worker = validateWorkerDiagnostic(workerDiagnostic, bindings);
  const failureDigest = lowerHex(
    failureReceiptDigestHex,
    32,
    'parent failure receipt digest',
  );
  const body = Object.freeze({
    schema: PARENT_SCHEMA,
    version: 1 as const,
    status: 'worker_failure_diagnostic_validated' as const,
    ...bindings,
    failureReceiptDigestHex: failureDigest,
    workerFailureReceiptDigestHex: worker.receiptDigestHex,
    stage: worker.stage,
    sourceFailurePhase: worker.sourceFailurePhase,
    rootCleanupEstablished: false as const,
    rawCausePublished: false as const,
  });
  return Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, PARENT_DIGEST_DOMAIN),
  });
}

function validateWorkerDiagnostic(
  value: unknown,
  expectedBindings: Readonly<NativeTwoCycleFailureBindingsV1>,
): Readonly<NativeTwoCycleWorkerFailureDiagnosticV1> {
  const expected = validateBindings(expectedBindings, 'expected worker failure bindings');
  const record = exactRecord(value, [
    'schema',
    'version',
    'status',
    'configSha256Hex',
    'expectedBridgeCommit',
    'pathIdentityDigestHex',
    'stage',
    'sourceFailurePhase',
    'rootCleanupEstablished',
    'rawCausePublished',
    'receiptDigestHex',
  ], 'native two-cycle worker failure diagnostic');
  if (
    record.schema !== WORKER_SCHEMA
    || record.version !== 1
    || record.status !== 'worker_failed'
    || record.rootCleanupEstablished !== false
    || record.rawCausePublished !== false
  ) {
    throw new Error('native two-cycle worker failure diagnostic identity differs');
  }
  const bindings = validateBindings({
    configSha256Hex: record.configSha256Hex,
    expectedBridgeCommit: record.expectedBridgeCommit,
    pathIdentityDigestHex: record.pathIdentityDigestHex,
  }, 'worker failure diagnostic bindings');
  if (
    bindings.configSha256Hex !== expected.configSha256Hex
    || bindings.expectedBridgeCommit !== expected.expectedBridgeCommit
    || bindings.pathIdentityDigestHex !== expected.pathIdentityDigestHex
  ) {
    throw new Error('native two-cycle worker failure diagnostic bindings differ');
  }
  const stage = failureStage(record.stage);
  const sourceFailurePhase = sourcePhase(record.sourceFailurePhase);
  if (stage !== 'root-or-cleanup' && sourceFailurePhase !== null) {
    throw new Error(
      'native two-cycle source failure phase requires root-or-cleanup stage',
    );
  }
  const receiptDigestHex = lowerHex(
    record.receiptDigestHex,
    32,
    'worker failure diagnostic receipt digest',
  );
  const { receiptDigestHex: ignored, ...body } = record;
  void ignored;
  if (receiptDigestHex !== sha256CanonicalJson(body, WORKER_DIGEST_DOMAIN)) {
    throw new Error('native two-cycle worker failure diagnostic digest differs');
  }
  return Object.freeze({
    schema: WORKER_SCHEMA,
    version: 1,
    status: 'worker_failed',
    ...bindings,
    stage,
    sourceFailurePhase,
    rootCleanupEstablished: false,
    rawCausePublished: false,
    receiptDigestHex,
  });
}

function validateBindings(
  value: unknown,
  label: string,
): Readonly<NativeTwoCycleFailureBindingsV1> {
  const record = exactRecord(value, [
    'configSha256Hex',
    'expectedBridgeCommit',
    'pathIdentityDigestHex',
  ], label);
  return Object.freeze({
    configSha256Hex: lowerHex(record.configSha256Hex, 32, `${label} config digest`),
    expectedBridgeCommit: lowerHex(record.expectedBridgeCommit, 20, `${label} commit`),
    pathIdentityDigestHex: lowerHex(
      record.pathIdentityDigestHex,
      32,
      `${label} path identity digest`,
    ),
  });
}

function failureStage(value: unknown): NativeTwoCycleFailureStageV1 {
  if (
    typeof value !== 'string'
    || !NATIVE_TWO_CYCLE_FAILURE_STAGES_V1.includes(
      value as NativeTwoCycleFailureStageV1,
    )
  ) {
    throw new Error('native two-cycle worker failure stage is unsupported');
  }
  return value as NativeTwoCycleFailureStageV1;
}

function sourcePhase(
  value: unknown,
): SubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1 | null {
  if (value === null) return null;
  if (
    typeof value !== 'string'
    || !SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_SOURCE_FAILURE_PHASES_V1.includes(
      value as SubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1,
    )
  ) {
    throw new Error('native two-cycle source failure phase is unsupported');
  }
  return value as SubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);
  if (actual.length !== keys.length || keys.some(key => !actual.includes(key))) {
    throw new Error(`${label} fields differ`);
  }
  return record;
}

function lowerHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)) {
    throw new Error(`${label} must be ${bytes}-byte lowercase hex`);
  }
  return value;
}
