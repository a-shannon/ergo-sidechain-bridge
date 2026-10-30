import { isProxy } from 'node:util/types';

import {
  assertNoDuplicateJsonKeys,
  canonicalJson,
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';

const WORKER_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-worker-recovery-locator.v1';
const PARENT_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-parent-recovery-locator.v1';
const WORKER_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_RECOVERY_LOCATOR_V1';
const PARENT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_RECOVERY_LOCATOR_V1';
const MAX_LOCATOR_RECEIPT_BYTES = 16 * 1024;

export interface RecoveryLocatorPointerV1 {
  readonly buildDirectoryName: string;
  readonly directoryName: string;
  readonly manifestSha256Hex: string;
}

export interface RecoveryLocatorBindingsV1 {
  readonly configSha256Hex: string;
  readonly bridgeCommit: string;
  readonly bridgeTree: string;
  readonly pathIdentityDigestHex: string;
  readonly toolIdentityDigestHex: string;
  readonly rootResultDigestHex: string;
}

export interface NativeTwoCycleWorkerRecoveryLocatorV1
  extends RecoveryLocatorBindingsV1 {
  readonly schema: typeof WORKER_SCHEMA;
  readonly version: 1;
  readonly status: 'root_recovery_locator_bound';
  readonly locator: Readonly<RecoveryLocatorPointerV1>;
  readonly nodeConsistencyEstablished: false;
  readonly freshRestartValidated: false;
  readonly executionAuthorityRestored: false;
  readonly receiptDigestHex: string;
}

export interface NativeTwoCycleParentRecoveryLocatorV1
  extends RecoveryLocatorBindingsV1 {
  readonly schema: typeof PARENT_SCHEMA;
  readonly version: 1;
  readonly status: 'worker_recovery_locator_validated';
  readonly terminalReceiptDigestHex: string;
  readonly workerRecoveryLocatorReceiptDigestHex: string;
  readonly locator: Readonly<RecoveryLocatorPointerV1>;
  readonly nodeConsistencyEstablished: false;
  readonly freshRestartValidated: false;
  readonly executionAuthorityRestored: false;
  readonly receiptDigestHex: string;
}

export function createNativeTwoCycleWorkerRecoveryLocatorV1(
  pointer: Readonly<RecoveryLocatorPointerV1>,
  bindings: Readonly<RecoveryLocatorBindingsV1>,
): Readonly<NativeTwoCycleWorkerRecoveryLocatorV1> {
  const body = Object.freeze({
    schema: WORKER_SCHEMA,
    version: 1 as const,
    status: 'root_recovery_locator_bound' as const,
    ...validateBindings(bindings, 'worker recovery locator bindings'),
    locator: validatePointer(pointer, 'worker recovery locator'),
    nodeConsistencyEstablished: false as const,
    freshRestartValidated: false as const,
    executionAuthorityRestored: false as const,
  });
  return Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, WORKER_DIGEST_DOMAIN),
  });
}

export function parseNativeTwoCycleWorkerRecoveryLocatorV1(
  text: string,
  expectedBindings: Readonly<RecoveryLocatorBindingsV1>,
): Readonly<NativeTwoCycleWorkerRecoveryLocatorV1> {
  return validateWorkerReceipt(
    parseCanonicalReceipt(text, 'native two-cycle worker recovery locator'),
    expectedBindings,
  );
}

export function createNativeTwoCycleParentRecoveryLocatorV1(
  workerText: string,
  expectedBindings: Readonly<RecoveryLocatorBindingsV1>,
  terminalReceiptDigestHex: string,
): Readonly<NativeTwoCycleParentRecoveryLocatorV1> {
  const bindings = validateBindings(
    expectedBindings,
    'parent recovery locator bindings',
  );
  const worker = parseNativeTwoCycleWorkerRecoveryLocatorV1(
    workerText,
    bindings,
  );
  return createParentReceipt(
    worker,
    bindings,
    lowerHex(
      terminalReceiptDigestHex,
      32,
      'parent recovery locator terminal receipt digest',
    ),
  );
}

export function parseNativeTwoCycleParentRecoveryLocatorV1(
  text: string,
  expectedBindings: Readonly<RecoveryLocatorBindingsV1>,
  terminalReceiptDigestHex: string,
  workerText: string,
): Readonly<NativeTwoCycleParentRecoveryLocatorV1> {
  const bindings = validateBindings(
    expectedBindings,
    'expected parent recovery locator bindings',
  );
  const terminalDigest = lowerHex(
    terminalReceiptDigestHex,
    32,
    'expected terminal receipt digest',
  );
  const worker = parseNativeTwoCycleWorkerRecoveryLocatorV1(
    workerText,
    bindings,
  );
  const record = exactRecord(
    parseCanonicalReceipt(text, 'native two-cycle parent recovery locator'),
    [
      'schema',
      'version',
      'status',
      'configSha256Hex',
      'bridgeCommit',
      'bridgeTree',
      'pathIdentityDigestHex',
      'toolIdentityDigestHex',
      'rootResultDigestHex',
      'terminalReceiptDigestHex',
      'workerRecoveryLocatorReceiptDigestHex',
      'locator',
      'nodeConsistencyEstablished',
      'freshRestartValidated',
      'executionAuthorityRestored',
      'receiptDigestHex',
    ],
    'native two-cycle parent recovery locator',
  );
  if (
    record.schema !== PARENT_SCHEMA
    || record.version !== 1
    || record.status !== 'worker_recovery_locator_validated'
    || record.nodeConsistencyEstablished !== false
    || record.freshRestartValidated !== false
    || record.executionAuthorityRestored !== false
  ) {
    throw new Error('native two-cycle parent recovery locator identity differs');
  }
  const actualBindings = validateBindings({
    configSha256Hex: record.configSha256Hex,
    bridgeCommit: record.bridgeCommit,
    bridgeTree: record.bridgeTree,
    pathIdentityDigestHex: record.pathIdentityDigestHex,
    toolIdentityDigestHex: record.toolIdentityDigestHex,
    rootResultDigestHex: record.rootResultDigestHex,
  }, 'parent recovery locator receipt bindings');
  assertMatchingBindings(actualBindings, bindings, 'parent recovery locator');
  const locator = validatePointer(record.locator, 'parent recovery locator');
  assertMatchingPointer(locator, worker.locator);
  const actualTerminalDigest = lowerHex(
    record.terminalReceiptDigestHex,
    32,
    'parent recovery locator terminal receipt digest',
  );
  if (actualTerminalDigest !== terminalDigest) {
    throw new Error('native two-cycle parent recovery locator terminal ancestry differs');
  }
  const workerDigest = lowerHex(
    record.workerRecoveryLocatorReceiptDigestHex,
    32,
    'parent recovery locator worker receipt digest',
  );
  if (workerDigest !== worker.receiptDigestHex) {
    throw new Error('native two-cycle parent recovery locator worker ancestry differs');
  }
  const receiptDigestHex = lowerHex(
    record.receiptDigestHex,
    32,
    'parent recovery locator receipt digest',
  );
  const { receiptDigestHex: ignored, ...body } = record;
  void ignored;
  if (receiptDigestHex !== sha256CanonicalJson(body, PARENT_DIGEST_DOMAIN)) {
    throw new Error('native two-cycle parent recovery locator digest differs');
  }
  return Object.freeze({
    schema: PARENT_SCHEMA,
    version: 1,
    status: 'worker_recovery_locator_validated',
    ...bindings,
    terminalReceiptDigestHex: terminalDigest,
    workerRecoveryLocatorReceiptDigestHex: workerDigest,
    locator,
    nodeConsistencyEstablished: false,
    freshRestartValidated: false,
    executionAuthorityRestored: false,
    receiptDigestHex,
  });
}

function createParentReceipt(
  worker: Readonly<NativeTwoCycleWorkerRecoveryLocatorV1>,
  bindings: Readonly<RecoveryLocatorBindingsV1>,
  terminalReceiptDigestHex: string,
): Readonly<NativeTwoCycleParentRecoveryLocatorV1> {
  const body = Object.freeze({
    schema: PARENT_SCHEMA,
    version: 1 as const,
    status: 'worker_recovery_locator_validated' as const,
    ...bindings,
    terminalReceiptDigestHex,
    workerRecoveryLocatorReceiptDigestHex: worker.receiptDigestHex,
    locator: worker.locator,
    nodeConsistencyEstablished: false as const,
    freshRestartValidated: false as const,
    executionAuthorityRestored: false as const,
  });
  return Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, PARENT_DIGEST_DOMAIN),
  });
}

function validateWorkerReceipt(
  value: unknown,
  expectedBindings: Readonly<RecoveryLocatorBindingsV1>,
): Readonly<NativeTwoCycleWorkerRecoveryLocatorV1> {
  const expected = validateBindings(
    expectedBindings,
    'expected worker recovery locator bindings',
  );
  const record = exactRecord(value, [
    'schema',
    'version',
    'status',
    'configSha256Hex',
    'bridgeCommit',
    'bridgeTree',
    'pathIdentityDigestHex',
    'toolIdentityDigestHex',
    'rootResultDigestHex',
    'locator',
    'nodeConsistencyEstablished',
    'freshRestartValidated',
    'executionAuthorityRestored',
    'receiptDigestHex',
  ], 'native two-cycle worker recovery locator');
  if (
    record.schema !== WORKER_SCHEMA
    || record.version !== 1
    || record.status !== 'root_recovery_locator_bound'
    || record.nodeConsistencyEstablished !== false
    || record.freshRestartValidated !== false
    || record.executionAuthorityRestored !== false
  ) {
    throw new Error('native two-cycle worker recovery locator identity differs');
  }
  const bindings = validateBindings({
    configSha256Hex: record.configSha256Hex,
    bridgeCommit: record.bridgeCommit,
    bridgeTree: record.bridgeTree,
    pathIdentityDigestHex: record.pathIdentityDigestHex,
    toolIdentityDigestHex: record.toolIdentityDigestHex,
    rootResultDigestHex: record.rootResultDigestHex,
  }, 'worker recovery locator receipt bindings');
  assertMatchingBindings(bindings, expected, 'worker recovery locator');
  const locator = validatePointer(record.locator, 'worker recovery locator');
  const receiptDigestHex = lowerHex(
    record.receiptDigestHex,
    32,
    'worker recovery locator receipt digest',
  );
  const { receiptDigestHex: ignored, ...body } = record;
  void ignored;
  if (receiptDigestHex !== sha256CanonicalJson(body, WORKER_DIGEST_DOMAIN)) {
    throw new Error('native two-cycle worker recovery locator digest differs');
  }
  return Object.freeze({
    schema: WORKER_SCHEMA,
    version: 1,
    status: 'root_recovery_locator_bound',
    ...bindings,
    locator,
    nodeConsistencyEstablished: false,
    freshRestartValidated: false,
    executionAuthorityRestored: false,
    receiptDigestHex,
  });
}

function parseCanonicalReceipt(text: string, label: string): unknown {
  if (typeof text !== 'string') throw new Error(`${label} must be text`);
  if (Buffer.byteLength(text, 'utf8') > MAX_LOCATOR_RECEIPT_BYTES) {
    throw new Error(`${label} exceeds 16 KiB`);
  }
  assertNoDuplicateJsonKeys(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} is invalid JSON`);
  }
  if (text !== `${canonicalJson(parsed)}\n`) {
    throw new Error(`${label} must be canonical JSON plus one LF`);
  }
  return parsed;
}

function validateBindings(
  value: unknown,
  label: string,
): Readonly<RecoveryLocatorBindingsV1> {
  const record = exactRecord(value, [
    'configSha256Hex',
    'bridgeCommit',
    'bridgeTree',
    'pathIdentityDigestHex',
    'toolIdentityDigestHex',
    'rootResultDigestHex',
  ], label);
  return Object.freeze({
    configSha256Hex: lowerHex(record.configSha256Hex, 32, `${label} config digest`),
    bridgeCommit: lowerHex(record.bridgeCommit, 20, `${label} bridge commit`),
    bridgeTree: lowerHex(record.bridgeTree, 20, `${label} bridge tree`),
    pathIdentityDigestHex: lowerHex(
      record.pathIdentityDigestHex,
      32,
      `${label} path identity digest`,
    ),
    toolIdentityDigestHex: lowerHex(
      record.toolIdentityDigestHex,
      32,
      `${label} tool identity digest`,
    ),
    rootResultDigestHex: lowerHex(
      record.rootResultDigestHex,
      32,
      `${label} root result digest`,
    ),
  });
}

function validatePointer(
  value: unknown,
  label: string,
): Readonly<RecoveryLocatorPointerV1> {
  const record = exactRecord(value, [
    'buildDirectoryName',
    'directoryName',
    'manifestSha256Hex',
  ], `${label} pointer`);
  if (
    typeof record.buildDirectoryName !== 'string'
    || !/^bridge-fed-genesis-[A-Za-z0-9]{6}$/u.test(record.buildDirectoryName)
  ) {
    throw new Error(`${label} build directory name is invalid`);
  }
  if (
    typeof record.directoryName !== 'string'
    || !/^two-cycle-recovery-[A-Za-z0-9]{6}$/u.test(record.directoryName)
  ) {
    throw new Error(`${label} directory name is invalid`);
  }
  return Object.freeze({
    buildDirectoryName: record.buildDirectoryName,
    directoryName: record.directoryName,
    manifestSha256Hex: lowerHex(
      record.manifestSha256Hex,
      32,
      `${label} manifest digest`,
    ),
  });
}

function assertMatchingBindings(
  actual: Readonly<RecoveryLocatorBindingsV1>,
  expected: Readonly<RecoveryLocatorBindingsV1>,
  label: string,
): void {
  if (
    actual.configSha256Hex !== expected.configSha256Hex
    || actual.bridgeCommit !== expected.bridgeCommit
    || actual.bridgeTree !== expected.bridgeTree
    || actual.pathIdentityDigestHex !== expected.pathIdentityDigestHex
    || actual.toolIdentityDigestHex !== expected.toolIdentityDigestHex
    || actual.rootResultDigestHex !== expected.rootResultDigestHex
  ) throw new Error(`native two-cycle ${label} bindings differ`);
}

function assertMatchingPointer(
  actual: Readonly<RecoveryLocatorPointerV1>,
  expected: Readonly<RecoveryLocatorPointerV1>,
): void {
  if (
    actual.buildDirectoryName !== expected.buildDirectoryName
    || actual.directoryName !== expected.directoryName
    || actual.manifestSha256Hex !== expected.manifestSha256Hex
  ) throw new Error('native two-cycle parent recovery locator worker ancestry differs');
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || isProxy(value)
  ) {
    throw new Error(`${label} must be a plain data object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain data object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length
    || actual.some(key => typeof key !== 'string' || !keys.includes(key))
  ) {
    throw new Error(`${label} fields differ`);
  }
  const record: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !('value' in descriptor)
      || descriptor.enumerable !== true
    ) {
      throw new Error(`${label} fields must be own enumerable data properties`);
    }
    record[key] = descriptor.value;
  }
  return record;
}

function lowerHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)
  ) throw new Error(`${label} must be ${bytes}-byte lowercase hex`);
  return value;
}
