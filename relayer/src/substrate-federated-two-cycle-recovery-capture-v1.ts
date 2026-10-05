import { createHash } from 'node:crypto';
import {
  closeSync, fsyncSync, lstatSync, mkdtempSync, openSync, readFileSync,
  readdirSync, realpathSync, renameSync, writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import Database from 'better-sqlite3';
import type { StateTracker } from './state-tracker.js';
import type {
  OwnedFederatedGenesisDevnetProcessSessionV1,
  OwnedFederatedGenesisDevnetProcessV1Receipt,
} from './substrate-federated-authority-safe-devnet-process-v1.js';
import type { SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV2 }
  from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  copySubstrateFederatedTwoCycleNodeStateV1,
  type TwoCycleNodeStateCopyManifestV1,
} from './substrate-federated-two-cycle-node-state-copy-v1.js';
import {
  exportSubstrateFederatedTwoCycleSqliteEvidenceV1,
  type RecoveryTrackerAttemptIdentityV1,
} from './substrate-federated-two-cycle-recovery-export-v1.js';

export const SUBSTRATE_FEDERATED_TWO_CYCLE_RECOVERY_CAPTURE_V1_SCHEMA =
  'e2s.substrate-federated-two-cycle-recovery-capture.v1' as const;

export interface TwoCycleRecoveryCaptureInputV1 {
  /** Current builder output and issuance journal, under exclusive caller control. */
  readonly targetDirectory: string;
  readonly journalDirectory: string;
  readonly tracker: StateTracker;
  readonly expectedAttempts: readonly [RecoveryTrackerAttemptIdentityV1, RecoveryTrackerAttemptIdentityV1];
  /** Exact retained owners; the Ergo owner enforces completed second-cycle admission. */
  readonly ergoSession: Pick<SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV2, 'stopWithStoppedData'>;
  readonly frontierSession: Pick<OwnedFederatedGenesisDevnetProcessSessionV1, 'closeWithStoppedData'>;
}

interface ManifestBindingV1 {
  readonly file: string;
  readonly bytes: number;
  readonly sha256Hex: string;
}

export interface TwoCycleRecoveryCaptureManifestV1 {
  readonly schema: typeof SUBSTRATE_FEDERATED_TWO_CYCLE_RECOVERY_CAPTURE_V1_SCHEMA;
  readonly kind: 'stopped-node-copy-and-sqlite-evidence';
  readonly components: Readonly<{
    ergo: ManifestBindingV1; frontier: ManifestBindingV1; sqlite: ManifestBindingV1;
  }>;
  readonly summary: Readonly<{
    ergoFiles: number; frontierFiles: number; nodeDatabaseBytes: number;
    sqliteDatabaseBytes: number; trackerAdmissionAttempts: 2;
  }>;
  readonly nodeConsistencyEstablished: false;
  readonly freshRestartValidated: false;
  readonly executionAuthorityRestored: false;
}

export interface TwoCycleRecoveryCaptureResultV1 {
  /** Relative to the supplied builder target; never an original owner data path. */
  readonly recoveryDirectory: string;
  readonly manifestSha256Hex: string;
  readonly manifest: Readonly<TwoCycleRecoveryCaptureManifestV1>;
  /** Original owner receipt, preserving its process-local provenance. */
  readonly frontierProcess: Readonly<OwnedFederatedGenesisDevnetProcessV1Receipt>;
}

/** Capture only after the live owner completes both cycles. This retires owners
 * and closes the tracker; it cannot launch nodes or restore execution authority.
 * Owner callbacks provide the stopped-data window after their own shutdown checks.
 * Copies and hashes do
 * not establish cross-node consistency or fresh-process restart acceptance. */
export async function captureSubstrateFederatedTwoCycleRecoveryV1(
  input: TwoCycleRecoveryCaptureInputV1,
): Promise<Readonly<TwoCycleRecoveryCaptureResultV1>> {
  // Freeze identities and methods before any callback can mutate caller inputs.
  const target = checkedDirectory(input.targetDirectory);
  const journal = checkedDirectory(input.journalDirectory);
  // The root puts issuance-journal-* under the builder target. Sibling captures
  // are allowed; placing the target itself inside the source journal is not.
  if (inside(journal, target)) throw new Error('capture target is inside source journal');
  const tracker = input.tracker;
  const ergoSession = input.ergoSession;
  const frontierSession = input.frontierSession;
  const stopErgo = ergoSession.stopWithStoppedData;
  const stopFrontier = frontierSession.closeWithStoppedData;
  if (typeof stopErgo !== 'function' || typeof stopFrontier !== 'function') {
    throw new Error('retained stopped-data owners are required');
  }
  const attempts = freezeAttempts(input.expectedAttempts);
  assertNoRetainedAuthority();
  const targetIdentity = directoryIdentity(target);
  const journalIdentity = directoryIdentity(journal);
  const staging = mkdtempSync(join(target, '.two-cycle-recovery.partial-'));
  const recoveryDirectory = basename(staging).replace('.two-cycle-recovery.partial-', 'two-cycle-recovery-');
  const output = join(target, recoveryDirectory);
  if (inside(journal, staging) || inside(staging, journal)
    || inside(journal, output) || inside(output, journal)) {
    throw new Error('capture staging or output overlaps source journal');
  }
  assertAbsent(output);
  const copied: Partial<Record<'ergo' | 'frontier', Readonly<TwoCycleNodeStateCopyManifestV1>>> = {};
  let ergoInvoked = false;
  let frontierInvoked = false;
  let ergoStopped = false;
  let frontierStopped = false;
  let trackerClosed = false;

  await stopErgo.call(ergoSession, async paths => {
    if (ergoInvoked) throw new Error('Ergo stopped-data callback repeated');
    ergoInvoked = true;
    let active = true;
    try {
      copied.ergo = await copySubstrateFederatedTwoCycleNodeStateV1({
        kind: 'ergo', primaryRoot: paths.primaryDataDirectory,
        witnessRoot: paths.witnessDataDirectory, destinationDirectory: join(staging, 'ergo'),
        assertSourcesQuiescent: () => {
          if (!active) throw new Error('Ergo stopped-data callback expired');
        },
      });
    } finally { active = false; }
  });
  if (!ergoInvoked || copied.ergo === undefined) throw new Error('Ergo stopped-data copy did not complete');
  ergoStopped = true;

  const frontierProcess = await stopFrontier.call(frontierSession, async paths => {
    if (frontierInvoked) throw new Error('Frontier stopped-data callback repeated');
    frontierInvoked = true;
    let active = true;
    try {
      copied.frontier = await copySubstrateFederatedTwoCycleNodeStateV1({
        kind: 'frontier', primaryRoot: paths.primaryBasePath,
        witnessRoot: paths.witnessBasePath, destinationDirectory: join(staging, 'frontier'),
        assertSourcesQuiescent: () => {
          if (!active) throw new Error('Frontier stopped-data callback expired');
        },
      });
    } finally { active = false; }
  });
  if (!frontierInvoked || copied.frontier === undefined) throw new Error('Frontier stopped-data copy did not complete');
  frontierStopped = true;
  assertNoRetainedAuthority();
  const sync = Object.freeze({ ...tracker.getSyncState() });
  tracker.close();
  trackerClosed = true;
  const sqlite = await exportSubstrateFederatedTwoCycleSqliteEvidenceV1({
    sourceRoot: journal, sourceDatabasePath: join(journal, 'state-store'),
    destinationDirectory: join(staging, 'sqlite'), expectedSyncState: sync,
    expectedAttempts: attempts,
    assertSourceQuiescent: () => {
      if (!ergoStopped || !frontierStopped || !trackerClosed) throw new Error('capture owners remain active');
    },
  });
  const components = Object.freeze({
    ergo: bindManifest('ergo', copied.ergo),
    frontier: bindManifest('frontier', copied.frontier),
    sqlite: bindManifest('sqlite', sqlite),
  });
  if (readdirSync(staging).sort().join() !== 'ergo,frontier,sqlite') {
    throw new Error('unexpected aggregate capture entry');
  }
  const manifest: Readonly<TwoCycleRecoveryCaptureManifestV1> = Object.freeze({
    schema: SUBSTRATE_FEDERATED_TWO_CYCLE_RECOVERY_CAPTURE_V1_SCHEMA,
    kind: 'stopped-node-copy-and-sqlite-evidence', components,
    summary: Object.freeze({ ergoFiles: copied.ergo.files.length,
      frontierFiles: copied.frontier.files.length,
      nodeDatabaseBytes: copied.ergo.totalBytes + copied.frontier.totalBytes,
      sqliteDatabaseBytes: sqlite.database.bytes, trackerAdmissionAttempts: 2 as const }),
    nodeConsistencyEstablished: false, freshRestartValidated: false, executionAuthorityRestored: false,
  });
  recheckParent(target, targetIdentity);
  recheckParent(journal, journalIdentity);
  checkedDirectory(staging);
  assertAbsent(output);
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const manifestPath = join(staging, 'manifest.json');
  // Last artifact: failed partials remain unpublished and available for inspection.
  writeFileSync(manifestPath, bytes, { flag: 'wx', mode: 0o600 });
  const fd = openSync(manifestPath, 'r+');
  try { fsyncSync(fd); } finally { closeSync(fd); }
  assertAbsent(output);
  renameSync(staging, output);
  return Object.freeze({ recoveryDirectory,
    manifestSha256Hex: createHash('sha256').update(bytes).digest('hex'), manifest, frontierProcess });

  function assertNoRetainedAuthority(): void {
    assertAbsent(join(journal, 'state-store.funds-execution.lock'));
    const source = join(journal, 'state-store');
    const stat = lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
      throw new Error('invalid journal database identity');
    }
    const raw = new Database(source, { readonly: true, fileMustExist: true });
    try {
      if (raw.prepare('SELECT COUNT(*) FROM funds_execution_authority').pluck().get() !== 0) {
        throw new Error('live funds execution authority prevents recovery capture');
      }
    } finally { raw.close(); }
    if (tracker.getPegInCircuitBreakerState().retainedExecutionAuthority) {
      throw new Error('retained funds execution authority prevents recovery capture');
    }
  }
  function bindManifest(component: 'ergo' | 'frontier' | 'sqlite', expected: object): ManifestBindingV1 {
    const file = `${component}/manifest.json`;
    const path = join(staging, file);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
      || stat.size < 1 || stat.size > 64 * 1024 * 1024) throw new Error('invalid component manifest');
    const bytes = readFileSync(path);
    if (!bytes.equals(Buffer.from(`${JSON.stringify(expected, null, 2)}\n`))) {
      throw new Error('component manifest bytes differ from completed copy');
    }
    return Object.freeze({ file, bytes: bytes.length, sha256Hex: createHash('sha256').update(bytes).digest('hex') });
  }
}

function freezeAttempts(values: TwoCycleRecoveryCaptureInputV1['expectedAttempts']) {
  if (!Array.isArray(values) || values.length !== 2) throw new Error('exactly two tracker admission identities are required');
  const result = values.map(value => {
    const copy = { expectedTxId: value.expectedTxId, durableAttemptDigestHex: value.durableAttemptDigestHex,
      authorizationDigestHex: value.authorizationDigestHex, transportDisposition: value.transportDisposition,
      confirmationHeight: value.confirmationHeight, confirmationHeaderIdHex: value.confirmationHeaderIdHex };
    for (const digest of [copy.expectedTxId, copy.durableAttemptDigestHex,
      copy.authorizationDigestHex, copy.confirmationHeaderIdHex]) {
      if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) throw new Error('invalid tracker admission digest');
    }
    if (!Number.isSafeInteger(copy.confirmationHeight) || copy.confirmationHeight < 1
      || !['accepted', 'ambiguous'].includes(copy.transportDisposition)) throw new Error('invalid tracker admission identity');
    return Object.freeze(copy);
  });
  if (result[0].expectedTxId === result[1].expectedTxId) throw new Error('tracker admission identities must be distinct');
  return Object.freeze(result) as unknown as TwoCycleRecoveryCaptureInputV1['expectedAttempts'];
}

function checkedDirectory(path: string): string {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')
    || path.split(/[\\/]/).includes('..')) throw new Error('capture directories must be absolute without traversal');
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const part of relative(current, absolute).split(sep).filter(Boolean)) {
    current = join(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('capture directory alias or invalid ancestor');
  }
  const canonical = realpathSync.native(absolute);
  if (process.platform === 'win32' ? canonical.toLowerCase() !== absolute.toLowerCase() : canonical !== absolute) {
    throw new Error('capture canonical path alias');
  }
  return absolute;
}
function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}
function directoryIdentity(path: string): string {
  const stat = lstatSync(path);
  return JSON.stringify([stat.dev, stat.ino, stat.mode]);
}
function recheckParent(path: string, expected: string): void {
  checkedDirectory(path);
  if (directoryIdentity(path) !== expected) throw new Error('capture parent changed');
}
function assertAbsent(path: string): void {
  try { lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new Error('capture destination already exists');
}
