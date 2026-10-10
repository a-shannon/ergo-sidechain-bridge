import { createHash } from 'node:crypto';
import {
  closeSync, existsSync, fsyncSync, lstatSync, mkdtempSync, openSync,
  readSync, realpathSync, readdirSync, renameSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import Database from 'better-sqlite3';
import {
  ERGO_OPERATIONAL_TRANSACTION_SCHEMA,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_TRACKER_ADMISSION_V2_OPERATION_PROFILE as TRACKER_PROFILE,
}
  from './relayer-core/ergo-operational-transaction-lifecycle.js';
import { StateTracker, type ErgoOperationalTransactionAttempt } from './state-tracker.js';
import { sha256CanonicalJson } from './strict-json.js';

export const SUBSTRATE_FEDERATED_TWO_CYCLE_SQLITE_EXPORT_V1_SCHEMA =
  'e2s.substrate-federated-two-cycle-sqlite-evidence-export.v1' as const;

export interface RecoveryTrackerAttemptIdentityV1 {
  readonly expectedTxId: string;
  readonly durableAttemptDigestHex: string;
  readonly authorizationDigestHex: string;
  readonly transportDisposition: 'accepted' | 'ambiguous';
  readonly confirmationHeight: number;
  readonly confirmationHeaderIdHex: string;
}

export interface TwoCycleSqliteEvidenceExportInputV1 {
  readonly sourceRoot: string;
  readonly sourceDatabasePath: string;
  /** Existing private parent; the new output directory must not already exist. */
  readonly destinationDirectory: string;
  readonly expectedSyncState: Readonly<ReturnType<StateTracker['getSyncState']>>;
  readonly expectedAttempts: readonly [RecoveryTrackerAttemptIdentityV1, RecoveryTrackerAttemptIdentityV1];
  /** The retained lifecycle owner must check retired authority, stopped writers and listeners.
   * This callback is a precondition, not an independently authenticated shutdown receipt. */
  readonly assertSourceQuiescent: () => void | Promise<void>;
  readonly maxDatabaseBytes?: number;
}

export interface TwoCycleSqliteEvidenceExportManifestV1 {
  readonly schema: typeof SUBSTRATE_FEDERATED_TWO_CYCLE_SQLITE_EXPORT_V1_SCHEMA;
  readonly kind: 'sqlite-evidence-only';
  readonly database: Readonly<{ file: 'state.sqlite'; bytes: number; sha256Hex: string }>;
  readonly syncState: Readonly<ReturnType<StateTracker['getSyncState']>>;
  readonly trackerAdmissionAttempts: readonly RecoveryTrackerAttemptIdentityV1[];
  /** Historical rows are evidence; their presence never restores execution capability. */
  readonly historicalInventory: Readonly<ReturnType<StateTracker['getSettlementAuthorityInventoryCounts']>>;
  readonly fundsExecutionAuthorityRows: 0;
  readonly circuitBreakerOpen: true;
}

const SIDECARS = ['-wal', '-shm', '-journal', '.funds-execution.lock',
  '.funds-release-hold', '.funds-release-continuity'] as const;
const MAX_BYTES = 1024 * 1024 * 1024;

/** Back up only the tracker journal. Does not export node databases, establish cycle
 * completion, restore custody, or grant signing, submission or funds authority.
 * The parent directories must remain under the caller's exclusive filesystem control. */
export async function exportSubstrateFederatedTwoCycleSqliteEvidenceV1(
  input: TwoCycleSqliteEvidenceExportInputV1,
): Promise<Readonly<TwoCycleSqliteEvidenceExportManifestV1>> {
  const limit = input.maxDatabaseBytes ?? 128 * 1024 * 1024;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BYTES) {
    throw new Error('invalid SQLite export byte bound');
  }
  // Freeze caller inputs before the first async boundary.
  const expectedSyncState = normalizeSync(input.expectedSyncState);
  if (!Array.isArray(input.expectedAttempts) || input.expectedAttempts.length !== 2) {
    throw new Error('exactly two tracker admission attempts are required');
  }
  const attempts = input.expectedAttempts.map(normalizeAttempt);
  if (attempts[0].expectedTxId === attempts[1].expectedTxId) {
    throw new Error('tracker admission attempts must be distinct');
  }
  const guard = input.assertSourceQuiescent;
  if (typeof guard !== 'function') throw new Error('source quiescence guard is required');
  const root = checkedPath(input.sourceRoot, 'directory');
  const source = checkedPath(input.sourceDatabasePath, 'file');
  if (!inside(root, source) || source === root) throw new Error('source database escapes source root');
  if (!isAbsolute(input.destinationDirectory)) throw new Error('destination must be absolute');
  const output = resolve(input.destinationDirectory);
  const parent = checkedPath(dirname(output), 'directory');
  if (inside(root, output) || inside(output, root) || output === parent) {
    throw new Error('source and destination roots overlap');
  }
  assertAbsent(output);
  await guard();
  checkedPath(source, 'file');
  assertNoFundsLock(source);
  checkSourceSidecarPaths(source, limit);
  const before = fingerprintSource(source, limit);
  const sourceObservation = inspectTracker(source, expectedSyncState, attempts, false);
  let database: Database.Database | undefined;
  let staging: string | undefined;
  try {
    database = new Database(source, { readonly: true, fileMustExist: true });
    quickCheck(database);
    staging = mkdtempSync(join(parent, `.${basename(output)}.partial-`));
    const target = join(staging, 'state.sqlite');
    // backup() includes committed WAL pages; copying the main file does not.
    const deadline = performance.now() + 30_000;
    await database.backup(target, { progress: () => {
      if (performance.now() > deadline) throw new Error('SQLite backup exceeded time bound');
      return 128;
    } });
    if (performance.now() > deadline) throw new Error('SQLite backup exceeded time bound');
    database.close();
    database = undefined;
    fingerprintFile(target, limit);
    assertNoSidecars(target);
    // A backup retains WAL journal mode. Normalize only the private new copy so
    // subsequent readonly consumers need no WAL/SHM or continuity sidecars.
    const normalized = new Database(target, { fileMustExist: true });
    try {
      quickCheck(normalized);
      if (normalized.pragma('journal_mode = DELETE', { simple: true }) !== 'delete') {
        throw new Error('backup journal normalization failed');
      }
    } finally { normalized.close(); }
    const targetRaw = new Database(target, { readonly: true, fileMustExist: true });
    try { quickCheck(targetRaw); } finally { targetRaw.close(); }
    const targetObservation = inspectTracker(target, expectedSyncState, attempts, true);
    if (JSON.stringify(sourceObservation) !== JSON.stringify(targetObservation)) {
      throw new Error('backup tracker evidence differs from source');
    }
    assertNoSidecars(target);
    const exported = fingerprintFile(target, limit);
    await guard();
    checkedPath(root, 'directory');
    checkedPath(parent, 'directory');
    checkedPath(staging, 'directory');
    assertNoFundsLock(source);
    checkSourceSidecarPaths(source, limit);
    if (JSON.stringify(before) !== JSON.stringify(fingerprintSource(source, limit))) {
      throw new Error('source database drifted during backup');
    }
    if (JSON.stringify(sourceObservation) !== JSON.stringify(
      inspectTracker(source, expectedSyncState, attempts, false),
    )) throw new Error('source tracker evidence drifted during backup');
    assertNoSidecars(target);
    if (JSON.stringify(exported) !== JSON.stringify(fingerprintFile(target, limit))) {
      throw new Error('destination database drifted during validation');
    }
    if (readdirSync(staging).join() !== 'state.sqlite') throw new Error('unexpected export file');
    const manifest = Object.freeze({
      schema: SUBSTRATE_FEDERATED_TWO_CYCLE_SQLITE_EXPORT_V1_SCHEMA,
      kind: 'sqlite-evidence-only' as const,
      database: Object.freeze({ file: 'state.sqlite' as const, bytes: exported.bytes,
        sha256Hex: exported.sha256Hex }),
      syncState: expectedSyncState,
      trackerAdmissionAttempts: Object.freeze(attempts),
      historicalInventory: targetObservation.inventory,
      fundsExecutionAuthorityRows: 0 as const,
      circuitBreakerOpen: true as const,
    });
    flushFile(target);
    assertAbsent(output);
    // The manifest is the last written artifact. Only a successful rename publishes it.
    const manifestPath = join(staging, 'manifest.json');
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    flushFile(manifestPath);
    renameSync(staging, output);
    return manifest;
  } finally {
    if (database?.open) database.close();
    // Failed .partial directories are retained for inspection, never returned as exports.
  }
}

function normalizeSync(value: TwoCycleSqliteEvidenceExportInputV1['expectedSyncState']) {
  const { latestErgoHeight, latestSidechainHeight, stateBoxId, preventionBoxId } = value;
  for (const height of [latestErgoHeight, latestSidechainHeight]) {
    if (!Number.isSafeInteger(height) || height < 0) throw new Error('invalid sync height');
  }
  for (const id of [stateBoxId, preventionBoxId]) {
    if (id !== null) requireDigest(id);
  }
  return Object.freeze({ latestErgoHeight, latestSidechainHeight, stateBoxId, preventionBoxId });
}

function normalizeAttempt(value: RecoveryTrackerAttemptIdentityV1): RecoveryTrackerAttemptIdentityV1 {
  const result = {
    expectedTxId: value.expectedTxId,
    durableAttemptDigestHex: value.durableAttemptDigestHex,
    authorizationDigestHex: value.authorizationDigestHex,
    transportDisposition: value.transportDisposition,
    confirmationHeight: value.confirmationHeight,
    confirmationHeaderIdHex: value.confirmationHeaderIdHex,
  };
  for (const digest of [result.expectedTxId, result.durableAttemptDigestHex,
    result.authorizationDigestHex, result.confirmationHeaderIdHex]) requireDigest(digest);
  if (!Number.isSafeInteger(result.confirmationHeight) || result.confirmationHeight < 1) {
    throw new Error('invalid tracker admission confirmation height');
  }
  if (result.transportDisposition !== 'accepted' && result.transportDisposition !== 'ambiguous') {
    throw new Error('invalid tracker admission transport disposition');
  }
  return Object.freeze(result);
}

function requireDigest(value: unknown): void {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error('invalid persisted identity digest');
  }
}

function inspectTracker(
  path: string,
  sync: TwoCycleSqliteEvidenceExportInputV1['expectedSyncState'],
  attempts: readonly RecoveryTrackerAttemptIdentityV1[],
  requireOpenBreaker: boolean,
) {
  assertNoFundsLock(path);
  const raw = new Database(path, { readonly: true, fileMustExist: true });
  try {
    if (raw.prepare('SELECT COUNT(*) FROM funds_execution_authority').pluck().get() !== 0) {
      throw new Error('live funds execution authority remains');
    }
  } finally { raw.close(); }
  const tracker = new StateTracker(path, { readOnly: true });
  try {
    if (JSON.stringify(normalizeSync(tracker.getSyncState())) !== JSON.stringify(sync)) {
      throw new Error('persisted sync identity mismatch');
    }
    const persisted = tracker.getErgoOperationalTransactionAttempts(TRACKER_PROFILE);
    if (persisted.length !== 2) throw new Error('persisted two-cycle tracker attempt count differs');
    for (const expected of attempts) {
      const actual = tracker.getErgoOperationalTransactionAttempt(expected.expectedTxId);
      if (actual === null || actual.operationProfile !== TRACKER_PROFILE
        || actual.status !== 'confirmed'
        || actual.submissionDisposition !== expected.transportDisposition
        || actual.submittedTxId !== (expected.transportDisposition === 'accepted'
          ? expected.expectedTxId : null)
        || actual.fundsReleaseAuthorityEpochHex !== null
        || actual.durableAttemptDigestHex !== expected.durableAttemptDigestHex
        || durableAttemptDigestHex(actual) !== actual.durableAttemptDigestHex
        || actual.authorizationDigestHex !== expected.authorizationDigestHex
        || actual.confirmationHeight !== expected.confirmationHeight
        || actual.confirmationHeaderId !== expected.confirmationHeaderIdHex) {
        throw new Error('persisted tracker admission attempt identity mismatch');
      }
    }
    const breaker = tracker.getPegInCircuitBreakerState();
    if (breaker.retainedExecutionAuthority || (requireOpenBreaker && !breaker.open)) {
      throw new Error('export must retain an open circuit breaker without execution authority');
    }
    return Object.freeze({ inventory: tracker.getSettlementAuthorityInventoryCounts() });
  } finally { tracker.close(); }
}

function durableAttemptDigestHex(attempt: ErgoOperationalTransactionAttempt): string {
  return sha256CanonicalJson({
    domain: 'E2S_ERGO_OPERATIONAL_DURABLE_ATTEMPT_V1',
    schema: ERGO_OPERATIONAL_TRANSACTION_SCHEMA,
    operationProfile: attempt.operationProfile,
    expectedTxId: attempt.expectedTxId,
    sourceBoxId: attempt.sourceBoxId,
    inputBoxIds: attempt.inputBoxIds,
    attemptedAtHeight: attempt.attemptedAtHeight,
    targetSidechainHeight: attempt.targetSidechainHeight,
    targetSidechainBlockHashHex: attempt.targetSidechainBlockHashHex,
    heartbeatKeyHex: attempt.heartbeatKeyHex,
    ...(attempt.reconciliationIdentityDigestHex === null
      ? {} : { reconciliationIdentityDigestHex: attempt.reconciliationIdentityDigestHex }),
    bindingDigestHex: attempt.bindingDigestHex,
    signedTransactionDigestHex: attempt.signedTransactionDigestHex,
    checkResponseDigestHex: attempt.checkResponseDigestHex,
    revalidationDigestHex: attempt.revalidationDigestHex,
    authorizationDigestHex: attempt.authorizationDigestHex,
    fundsReleaseAuthorityEpochHex: attempt.fundsReleaseAuthorityEpochHex,
  });
}

function checkedPath(path: string, kind: 'file' | 'directory'): string {
  if (!isAbsolute(path)) throw new Error('export paths must be absolute');
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const part of relative(current, absolute).split(sep).filter(Boolean)) {
    current = join(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('path aliases are forbidden');
    if (current !== absolute && !stat.isDirectory()) throw new Error('invalid path ancestor');
  }
  const stat = lstatSync(absolute);
  if ((kind === 'file' ? !stat.isFile() : !stat.isDirectory())
    || (kind === 'file' && stat.nlink !== 1)) throw new Error('invalid export file or hardlink');
  if (realpathSync.native(absolute).toLowerCase() !== absolute.toLowerCase()) {
    throw new Error('canonical path alias is forbidden');
  }
  return absolute;
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

function assertAbsent(path: string): void {
  try { lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new Error('export destination or forbidden sidecar already exists');
}

function assertNoFundsLock(path: string): void { assertAbsent(`${path}.funds-execution.lock`); }
function assertNoSidecars(path: string): void { SIDECARS.forEach(suffix => assertAbsent(`${path}${suffix}`)); }

function checkSourceSidecarPaths(path: string, limit: number): void {
  for (const suffix of SIDECARS) {
    const file = `${path}${suffix}`;
    try { lstatSync(file); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    checkedPath(file, 'file');
    if (lstatSync(file).size > limit) throw new Error('source sidecar exceeds byte bound');
  }
}

function fingerprintSource(path: string, limit: number) {
  return [path, `${path}-wal`, `${path}-journal`].map(file => {
    if (!existsSync(file)) return null;
    checkedPath(file, 'file');
    // A readonly WAL open may create an empty WAL. It carries no committed pages.
    if (file !== path && lstatSync(file).size === 0) return null;
    return fingerprintFile(file, limit);
  });
}

function fingerprintFile(path: string, limit: number) {
  checkedPath(path, 'file');
  const stat = lstatSync(path);
  if (stat.size < 1 || stat.size > limit) throw new Error('SQLite export exceeds byte bound');
  const fd = openSync(path, 'r');
  const hash = createHash('sha256');
  try {
    const buffer = Buffer.alloc(64 * 1024);
    let offset = 0;
    while (offset < stat.size) {
      const count = readSync(fd, buffer, 0, Math.min(buffer.length, stat.size - offset), offset);
      if (count === 0) throw new Error('truncated SQLite export');
      hash.update(buffer.subarray(0, count));
      offset += count;
    }
  } finally { closeSync(fd); }
  const after = lstatSync(path);
  if (after.size !== stat.size || after.ino !== stat.ino || after.mtimeMs !== stat.mtimeMs) {
    throw new Error('file drifted while hashing');
  }
  return { bytes: stat.size, sha256Hex: hash.digest('hex'), ino: stat.ino, dev: stat.dev };
}

function quickCheck(database: Database.Database): void {
  const result = database.pragma('quick_check') as Array<{ quick_check: string }>;
  if (result.length !== 1 || result[0].quick_check !== 'ok') throw new Error('SQLite quick_check failed');
}

function flushFile(path: string): void {
  const fd = openSync(path, 'r+');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
