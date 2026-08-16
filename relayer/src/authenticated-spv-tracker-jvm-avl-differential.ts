import { createHash } from 'crypto';
import { readFileSync, realpathSync } from 'fs';
import { createRequire } from 'module';
import { isAbsolute, relative, resolve } from 'path';

import {
  AUTHENTICATED_SPV_TRACKER_JVM_AVL_FIXTURE_SCHEMA,
  validateAuthenticatedSpvTrackerJvmAvlFixture,
  type AuthenticatedSpvTrackerJvmAvlFixture,
  type AuthenticatedSpvTrackerJvmAvlFixtureCase,
  type AuthenticatedSpvTrackerJvmAvlOutcome,
  type AuthenticatedSpvTrackerJvmAvlReport,
} from './authenticated-v2-source-tree-conformance.js';

const WASM_LOCK_SCHEMA = 'e2s.authenticated-spv-tracker-jvm-avl-wasm-lock.v3';
export const AUTHENTICATED_SPV_TRACKER_JVM_AVL_DIFFERENTIAL_RESULT_SCHEMA =
  'e2s.authenticated-spv-tracker-jvm-avl-differential-result.v1';
export const AUTHENTICATED_SPV_TRACKER_JVM_AVL_DIFFERENTIAL_RESULT_PREFIX =
  'E2S_AUTHENTICATED_SPV_TRACKER_JVM_AVL_DIFFERENTIAL=';
const WASM_SOURCE_PATHS = [
  'wasm-avl/rust-toolchain.toml',
  'wasm-avl/Cargo.toml',
  'wasm-avl/Cargo.lock',
  'wasm-avl/src/lib.rs',
  'relayer/src/scripts/build-wasm-avl.ts',
] as const;
const WASM_RUNTIME_PATHS = [
  'wasm-avl/pkg/bridge_avl.js',
  'wasm-avl/pkg/bridge_avl_bg.wasm',
] as const;
const require = createRequire(import.meta.url);

interface TrackerWasmApi {
  tracker_v2_empty_digest(): string;
  tracker_v2_get_proof(historyJson: string, keyHex: string): string;
  tracker_v2_insert(historyJson: string, keyHex: string, valueHex: string): string;
  tracker_v2_verify_insert(
    currentDigestHex: string,
    keyHex: string,
    valueHex: string,
    proofHex: string,
  ): string;
}

interface WasmLockFile {
  path: string;
  sha256: string;
}

interface AuthenticatedSpvTrackerJvmAvlWasmLock {
  schema: typeof WASM_LOCK_SCHEMA;
  sourceFiles: WasmLockFile[];
  runtimeArtifacts: WasmLockFile[];
}

export interface AuthenticatedSpvTrackerJvmAvlWasmIdentity {
  lockSha256Hex: string;
  sourceFiles: readonly WasmLockFile[];
  runtimeArtifacts: readonly WasmLockFile[];
  wasmArtifactSha256Hex: string;
  wasmGlueSha256Hex: string;
}

export type AuthenticatedSpvTrackerAvlDisposition =
  | 'accept-exact'
  | 'accept-different'
  | 'reject';

export interface AuthenticatedSpvTrackerJvmAvlDifferentialCase {
  caseId: string;
  wasmDisposition: AuthenticatedSpvTrackerAvlDisposition;
  wasmSuccessorDigestHex: string | null;
  expectedJvmDisposition: AuthenticatedSpvTrackerAvlDisposition;
  expectedJvmOutcome: AuthenticatedSpvTrackerJvmAvlOutcome;
  expectedSuccessorDigestHex: string;
}

export interface AuthenticatedSpvTrackerJvmAvlDifferentialCorpus {
  fixture: AuthenticatedSpvTrackerJvmAvlFixture;
  cases: AuthenticatedSpvTrackerJvmAvlDifferentialCase[];
  wasmIdentity: AuthenticatedSpvTrackerJvmAvlWasmIdentity;
}

export interface AuthenticatedSpvTrackerJvmAvlDifferentialRow {
  caseId: string;
  wasm: AuthenticatedSpvTrackerAvlDisposition;
  jvm: AuthenticatedSpvTrackerAvlDisposition;
  expectedJvm: AuthenticatedSpvTrackerAvlDisposition;
  jvmOutcome: AuthenticatedSpvTrackerJvmAvlOutcome;
  expectedJvmOutcome: AuthenticatedSpvTrackerJvmAvlOutcome;
  exactAcceptedDigestParity: boolean | null;
}

interface TrackerHistoryEntry {
  key: string;
  value: string;
}

interface CanonicalInsert {
  fixtureCase: AuthenticatedSpvTrackerJvmAvlFixtureCase;
  expectedSuccessorDigestHex: string;
}

interface WasmObservation {
  disposition: AuthenticatedSpvTrackerAvlDisposition;
  successorDigestHex: string | null;
}

interface ExpectedJvmCase {
  disposition: AuthenticatedSpvTrackerAvlDisposition;
  outcome: AuthenticatedSpvTrackerJvmAvlOutcome;
}

const EXPECTED_JVM_CASES: Record<string, ExpectedJvmCase> = {
  'canonical-empty': { disposition: 'accept-exact', outcome: 'operation-accepted' },
  'canonical-non-empty': { disposition: 'accept-exact', outcome: 'operation-accepted' },
  'rotation-ll': { disposition: 'accept-exact', outcome: 'operation-accepted' },
  'rotation-rr': { disposition: 'accept-exact', outcome: 'operation-accepted' },
  'rotation-lr': { disposition: 'accept-exact', outcome: 'operation-accepted' },
  'rotation-rl': { disposition: 'accept-exact', outcome: 'operation-accepted' },
  'wrong-digest': { disposition: 'reject', outcome: 'operation-rejected' },
  'wrong-height': { disposition: 'accept-different', outcome: 'operation-accepted' },
  'wrong-key': { disposition: 'reject', outcome: 'operation-rejected' },
  'existing-key': { disposition: 'reject', outcome: 'operation-rejected' },
  'wrong-value': { disposition: 'accept-different', outcome: 'operation-accepted' },
  'truncated-proof': { disposition: 'reject', outcome: 'operation-rejected' },
  'trailing-direction-byte-00': { disposition: 'accept-exact', outcome: 'operation-accepted' },
  'trailing-direction-byte-ff': { disposition: 'accept-exact', outcome: 'operation-accepted' },
  'trailing-direction-bit': { disposition: 'accept-exact', outcome: 'operation-accepted' },
  'noncanonical-balance-7f': { disposition: 'reject', outcome: 'operation-rejected' },
  'noncanonical-balance-fe': { disposition: 'reject', outcome: 'operation-rejected' },
};

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(record: Record<string, unknown>, expected: string[], label: string): void {
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} must contain exactly ${sortedExpected.join(', ')}`);
  }
}

function validateLockFile(value: unknown, expectedPath: string, label: string): WasmLockFile {
  const record = requireRecord(value, label);
  assertExactKeys(record, ['path', 'sha256'], label);
  if (record.path !== expectedPath) throw new Error(`${label} path is not the reviewed path`);
  if (typeof record.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(record.sha256)) {
    throw new Error(`${label} SHA-256 is malformed`);
  }
  return { path: expectedPath, sha256: record.sha256 };
}

export function validateAuthenticatedSpvTrackerJvmAvlWasmLock(
  value: unknown,
): AuthenticatedSpvTrackerJvmAvlWasmLock {
  const record = requireRecord(value, 'JVM AVL WASM lock');
  assertExactKeys(record, ['schema', 'sourceFiles', 'runtimeArtifacts'], 'JVM AVL WASM lock');
  if (record.schema !== WASM_LOCK_SCHEMA) throw new Error('JVM AVL WASM lock schema is unsupported');
  const sourceFiles = record.sourceFiles;
  const runtimeArtifacts = record.runtimeArtifacts;
  if (!Array.isArray(sourceFiles) || sourceFiles.length !== WASM_SOURCE_PATHS.length) {
    throw new Error('JVM AVL WASM lock source file set is incomplete');
  }
  if (!Array.isArray(runtimeArtifacts) || runtimeArtifacts.length !== WASM_RUNTIME_PATHS.length) {
    throw new Error('JVM AVL WASM lock runtime artifact set is incomplete');
  }
  return Object.freeze({
    schema: WASM_LOCK_SCHEMA,
    sourceFiles: WASM_SOURCE_PATHS.map((path, index) => (
      Object.freeze(validateLockFile(sourceFiles[index], path, `JVM AVL WASM source ${index}`))
    )),
    runtimeArtifacts: WASM_RUNTIME_PATHS.map((path, index) => (
      Object.freeze(validateLockFile(runtimeArtifacts[index], path, `JVM AVL WASM artifact ${index}`))
    )),
  });
}

function resolveLockedFile(
  bridgeRoot: string,
  entry: WasmLockFile,
  label: string,
  canonicalText: boolean,
): string {
  const candidate = realpathSync(resolve(bridgeRoot, entry.path));
  const relativePath = relative(bridgeRoot, candidate);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`${label} escapes the bridge source tree`);
  }
  const bytes = readFileSync(candidate);
  const digest = canonicalText
    ? sha256(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'))
    : sha256(bytes);
  if (digest !== entry.sha256) {
    throw new Error(
      `${label} does not match the reviewed SHA-256 `
      + `(expected ${entry.sha256}, observed ${digest}, bytes ${bytes.length})`,
    );
  }
  return candidate;
}

function loadPinnedTrackerWasm(bridgeRootInput: string): {
  api: TrackerWasmApi;
  identity: AuthenticatedSpvTrackerJvmAvlWasmIdentity;
} {
  const bridgeRoot = realpathSync(bridgeRootInput);
  const lockPath = realpathSync(resolve(
    bridgeRoot,
    'sources',
    'authenticated-spv-tracker-jvm-avl-wasm-lock.json',
  ));
  const lockBytes = readFileSync(lockPath);
  const lock = validateAuthenticatedSpvTrackerJvmAvlWasmLock(JSON.parse(lockBytes.toString('utf8')));
  lock.sourceFiles.forEach((entry, index) => {
    resolveLockedFile(bridgeRoot, entry, `JVM AVL WASM source ${index}`, true);
  });
  const runtimePaths = lock.runtimeArtifacts.map((entry, index) => (
    resolveLockedFile(bridgeRoot, entry, `JVM AVL WASM artifact ${index}`, false)
  ));

  const loaded = require(runtimePaths[0]) as unknown;
  const apiRecord = requireRecord(loaded, 'locked JVM AVL WASM module');
  const requiredExports = [
    'tracker_v2_empty_digest',
    'tracker_v2_get_proof',
    'tracker_v2_insert',
    'tracker_v2_verify_insert',
  ];
  if (requiredExports.some(name => typeof apiRecord[name] !== 'function')) {
    throw new Error('locked JVM AVL WASM module is missing a required export');
  }
  return {
    api: apiRecord as unknown as TrackerWasmApi,
    identity: Object.freeze({
      lockSha256Hex: sha256(Buffer.from(JSON.stringify(lock), 'utf8')),
      sourceFiles: lock.sourceFiles,
      runtimeArtifacts: lock.runtimeArtifacts,
      wasmGlueSha256Hex: lock.runtimeArtifacts[0].sha256,
      wasmArtifactSha256Hex: lock.runtimeArtifacts[1].sha256,
    }),
  };
}

function repeatedHex(byte: number, length: number): string {
  if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw new Error('fixture byte is invalid');
  return byte.toString(16).padStart(2, '0').repeat(length);
}

function historyEntry(keyByte: number, valueByte: number): TrackerHistoryEntry {
  return {
    key: repeatedHex(keyByte, 32),
    value: repeatedHex(valueByte, 264),
  };
}

function trackerDigest(api: TrackerWasmApi, history: TrackerHistoryEntry[]): string {
  if (history.length === 0) return api.tracker_v2_empty_digest();
  const observation = JSON.parse(api.tracker_v2_get_proof(
    JSON.stringify(history),
    history[0].key,
  )) as { digest_hex?: unknown };
  if (typeof observation.digest_hex !== 'string' || observation.digest_hex.length !== 66) {
    throw new Error('WASM tracker digest output is malformed');
  }
  return observation.digest_hex;
}

function canonicalInsert(
  api: TrackerWasmApi,
  caseId: string,
  history: TrackerHistoryEntry[],
  keyByte: number,
  valueByte: number,
): CanonicalInsert {
  const currentDigestHex = trackerDigest(api, history);
  const keyHex = repeatedHex(keyByte, 32);
  const valueHex = repeatedHex(valueByte, 264);
  const inserted = JSON.parse(api.tracker_v2_insert(
    JSON.stringify(history),
    keyHex,
    valueHex,
  )) as { insert_proof_hex?: unknown; new_digest_hex?: unknown };
  if (
    typeof inserted.insert_proof_hex !== 'string'
    || inserted.insert_proof_hex.length < 2
    || typeof inserted.new_digest_hex !== 'string'
    || inserted.new_digest_hex.length !== 66
  ) {
    throw new Error(`WASM tracker insert output is malformed for ${caseId}`);
  }
  const replayed = JSON.parse(api.tracker_v2_verify_insert(
    currentDigestHex,
    keyHex,
    valueHex,
    inserted.insert_proof_hex,
  )) as { new_digest_hex?: unknown };
  if (replayed.new_digest_hex !== inserted.new_digest_hex) {
    throw new Error(`WASM tracker insert replay changed the successor digest for ${caseId}`);
  }
  return {
    fixtureCase: {
      caseId,
      currentDigestHex,
      keyHex,
      valueHex,
      proofHex: inserted.insert_proof_hex,
    },
    expectedSuccessorDigestHex: inserted.new_digest_hex,
  };
}

function mutateByte(hex: string, byteIndex: number, value: number): string {
  const bytes = Buffer.from(hex, 'hex');
  if (byteIndex < 0 || byteIndex >= bytes.length) throw new Error('mutation offset is outside the value');
  bytes[byteIndex] = value;
  return bytes.toString('hex');
}

function xorByte(hex: string, byteIndex: number, mask: number): string {
  const bytes = Buffer.from(hex, 'hex');
  if (byteIndex < 0 || byteIndex >= bytes.length) throw new Error('mutation offset is outside the value');
  bytes[byteIndex] ^= mask;
  return bytes.toString('hex');
}

function inspectPackagedProof(proofHex: string): {
  internalBalanceOffsets: number[];
  directionOffset: number;
} {
  const proof = Buffer.from(proofHex, 'hex');
  const internalBalanceOffsets: number[] = [];
  let cursor = 0;
  let previousLeafNextKey = false;
  while (cursor < proof.length) {
    const tagOffset = cursor;
    const tag = proof[cursor++];
    if (tag === 4) return { internalBalanceOffsets, directionOffset: cursor };
    if (tag === 3) {
      cursor += 32;
      previousLeafNextKey = false;
    } else if (tag === 2) {
      if (!previousLeafNextKey) cursor += 32;
      cursor += 32 + 264;
      previousLeafNextKey = true;
    } else if (tag === 0 || tag === 1 || tag === 255) {
      internalBalanceOffsets.push(tagOffset);
    } else {
      throw new Error(`canonical WASM proof contains unsupported tag ${tag}`);
    }
    if (cursor > proof.length) throw new Error('canonical WASM proof is truncated');
  }
  throw new Error('canonical WASM proof has no tree terminator');
}

function observeWasm(
  api: TrackerWasmApi,
  fixtureCase: AuthenticatedSpvTrackerJvmAvlFixtureCase,
  expectedSuccessorDigestHex: string,
): WasmObservation {
  try {
    const replay = JSON.parse(api.tracker_v2_verify_insert(
      fixtureCase.currentDigestHex,
      fixtureCase.keyHex,
      fixtureCase.valueHex,
      fixtureCase.proofHex,
    )) as { new_digest_hex?: unknown };
    if (typeof replay.new_digest_hex !== 'string' || replay.new_digest_hex.length !== 66) {
      throw new Error('WASM tracker replay output is malformed');
    }
    return {
      disposition: replay.new_digest_hex === expectedSuccessorDigestHex
        ? 'accept-exact'
        : 'accept-different',
      successorDigestHex: replay.new_digest_hex,
    };
  } catch {
    return { disposition: 'reject', successorDigestHex: null };
  }
}

function jvmDisposition(
  accepted: boolean,
  successorDigestHex: string | null,
  expectedSuccessorDigestHex: string,
): AuthenticatedSpvTrackerAvlDisposition {
  if (!accepted) return 'reject';
  return successorDigestHex === expectedSuccessorDigestHex
    ? 'accept-exact'
    : 'accept-different';
}

export function compareAuthenticatedSpvTrackerJvmAvlDifferential(
  corpus: AuthenticatedSpvTrackerJvmAvlDifferentialCorpus,
  report: AuthenticatedSpvTrackerJvmAvlReport,
): AuthenticatedSpvTrackerJvmAvlDifferentialRow[] {
  if (report.cases.length !== corpus.cases.length) {
    throw new Error('JVM AVL result count does not match the differential corpus');
  }
  return corpus.cases.map((entry, index) => {
    const observed = report.cases[index];
    if (!observed || observed.caseId !== entry.caseId) {
      throw new Error(`JVM AVL result is missing or reordered for ${entry.caseId}`);
    }
    const jvm = jvmDisposition(
      observed.operationAccepted,
      observed.successorDigestHex,
      entry.expectedSuccessorDigestHex,
    );
    if (jvm !== entry.expectedJvmDisposition) {
      throw new Error(`JVM AVL disposition changed for ${entry.caseId}`);
    }
    if (observed.outcome !== entry.expectedJvmOutcome) {
      throw new Error(`JVM AVL outcome changed for ${entry.caseId}`);
    }
    const exactAcceptedDigestParity = entry.wasmSuccessorDigestHex === null
      || observed.successorDigestHex === null
      ? null
      : observed.successorDigestHex === entry.wasmSuccessorDigestHex;
    if (exactAcceptedDigestParity === false) {
      throw new Error(`WASM/JVM accepted successor digest changed for ${entry.caseId}`);
    }
    return {
      caseId: entry.caseId,
      wasm: entry.wasmDisposition,
      jvm,
      expectedJvm: entry.expectedJvmDisposition,
      jvmOutcome: observed.outcome,
      expectedJvmOutcome: entry.expectedJvmOutcome,
      exactAcceptedDigestParity,
    };
  });
}

export function buildAuthenticatedSpvTrackerJvmAvlDifferentialCorpus(input: {
  bridgeRoot: string;
}): AuthenticatedSpvTrackerJvmAvlDifferentialCorpus {
  const loaded = loadPinnedTrackerWasm(input.bridgeRoot);
  const api = loaded.api;
  const canonical = [
    canonicalInsert(api, 'canonical-empty', [], 0x40, 0x41),
    canonicalInsert(api, 'canonical-non-empty', [
      historyEntry(0x20, 0x21),
      historyEntry(0x80, 0x81),
      historyEntry(0xc0, 0xc1),
    ], 0x40, 0x41),
    canonicalInsert(api, 'rotation-ll', [historyEntry(0x30, 0x31), historyEntry(0x20, 0x21)], 0x10, 0x11),
    canonicalInsert(api, 'rotation-rr', [historyEntry(0x10, 0x11), historyEntry(0x20, 0x21)], 0x30, 0x31),
    canonicalInsert(api, 'rotation-lr', [historyEntry(0x30, 0x31), historyEntry(0x10, 0x11)], 0x20, 0x21),
    canonicalInsert(api, 'rotation-rl', [historyEntry(0x10, 0x11), historyEntry(0x30, 0x31)], 0x20, 0x21),
  ];
  const base = canonical[1];
  const shape = inspectPackagedProof(base.fixtureCase.proofHex);
  if (shape.internalBalanceOffsets.length === 0) {
    throw new Error('non-empty WASM proof has no internal balance to mutate');
  }
  const proofBytes = Buffer.from(base.fixtureCase.proofHex, 'hex');
  const startingHeight = Number.parseInt(base.fixtureCase.currentDigestHex.slice(-2), 16);
  if (shape.directionOffset >= proofBytes.length || startingHeight >= 8) {
    throw new Error('reviewed direction-bit mutation assumptions no longer hold');
  }
  const lastInternalOffset = shape.internalBalanceOffsets.at(-1) as number;
  const mutations: CanonicalInsert[] = [
    {
      fixtureCase: {
        ...base.fixtureCase,
        caseId: 'wrong-digest',
        currentDigestHex: xorByte(base.fixtureCase.currentDigestHex, 0, 0x01),
      },
      expectedSuccessorDigestHex: base.expectedSuccessorDigestHex,
    },
    {
      fixtureCase: {
        ...base.fixtureCase,
        caseId: 'wrong-height',
        currentDigestHex: mutateByte(
          base.fixtureCase.currentDigestHex,
          32,
          (startingHeight + 1) & 0xff,
        ),
      },
      expectedSuccessorDigestHex: base.expectedSuccessorDigestHex,
    },
    {
      fixtureCase: { ...base.fixtureCase, caseId: 'wrong-key', keyHex: repeatedHex(0xe0, 32) },
      expectedSuccessorDigestHex: base.expectedSuccessorDigestHex,
    },
    {
      fixtureCase: { ...base.fixtureCase, caseId: 'existing-key', keyHex: repeatedHex(0x20, 32) },
      expectedSuccessorDigestHex: base.expectedSuccessorDigestHex,
    },
    {
      fixtureCase: { ...base.fixtureCase, caseId: 'wrong-value', valueHex: repeatedHex(0x42, 264) },
      expectedSuccessorDigestHex: base.expectedSuccessorDigestHex,
    },
    {
      fixtureCase: {
        ...base.fixtureCase,
        caseId: 'truncated-proof',
        proofHex: base.fixtureCase.proofHex.slice(0, -2),
      },
      expectedSuccessorDigestHex: base.expectedSuccessorDigestHex,
    },
    {
      fixtureCase: {
        ...base.fixtureCase,
        caseId: 'trailing-direction-byte-00',
        proofHex: `${base.fixtureCase.proofHex}00`,
      },
      expectedSuccessorDigestHex: base.expectedSuccessorDigestHex,
    },
    {
      fixtureCase: {
        ...base.fixtureCase,
        caseId: 'trailing-direction-byte-ff',
        proofHex: `${base.fixtureCase.proofHex}ff`,
      },
      expectedSuccessorDigestHex: base.expectedSuccessorDigestHex,
    },
    {
      fixtureCase: {
        ...base.fixtureCase,
        caseId: 'trailing-direction-bit',
        proofHex: xorByte(base.fixtureCase.proofHex, proofBytes.length - 1, 0x80),
      },
      expectedSuccessorDigestHex: base.expectedSuccessorDigestHex,
    },
    {
      fixtureCase: {
        ...base.fixtureCase,
        caseId: 'noncanonical-balance-7f',
        proofHex: mutateByte(base.fixtureCase.proofHex, lastInternalOffset, 0x7f),
      },
      expectedSuccessorDigestHex: base.expectedSuccessorDigestHex,
    },
    {
      fixtureCase: {
        ...base.fixtureCase,
        caseId: 'noncanonical-balance-fe',
        proofHex: mutateByte(base.fixtureCase.proofHex, lastInternalOffset, 0xfe),
      },
      expectedSuccessorDigestHex: base.expectedSuccessorDigestHex,
    },
  ];
  const allCases = [...canonical, ...mutations];
  if (
    Object.keys(EXPECTED_JVM_CASES).length !== allCases.length
    || allCases.some(entry => EXPECTED_JVM_CASES[entry.fixtureCase.caseId] === undefined)
  ) {
    throw new Error('reviewed JVM matrix does not match the differential corpus');
  }
  const fixture = validateAuthenticatedSpvTrackerJvmAvlFixture({
    schema: AUTHENTICATED_SPV_TRACKER_JVM_AVL_FIXTURE_SCHEMA,
    cases: allCases.map(entry => entry.fixtureCase),
    boundaries: {
      nodeStatefulAcceptance: false,
      signingPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      gate5Closed: false,
    },
  });
  return {
    fixture,
    cases: allCases.map(entry => {
      const observed = observeWasm(api, entry.fixtureCase, entry.expectedSuccessorDigestHex);
      const expectedJvm = EXPECTED_JVM_CASES[entry.fixtureCase.caseId];
      return {
        caseId: entry.fixtureCase.caseId,
        wasmDisposition: observed.disposition,
        wasmSuccessorDigestHex: observed.successorDigestHex,
        expectedJvmDisposition: expectedJvm.disposition,
        expectedJvmOutcome: expectedJvm.outcome,
        expectedSuccessorDigestHex: entry.expectedSuccessorDigestHex,
      };
    }),
    wasmIdentity: loaded.identity,
  };
}
