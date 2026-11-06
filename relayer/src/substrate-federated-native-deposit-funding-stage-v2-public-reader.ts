import { lstatSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { types } from 'node:util';

import { canonicalPathIdentity, readBoundedRegularFile }
  from './create-only-out-of-repository-artifact.js';
import { assertNoDuplicateJsonKeys, canonicalJson, sha256CanonicalJson }
  from './ergo-settlement-core/strict-json.js';
import { parseNativeDepositFundingParentStageV2,
  type NativeDepositFundingParentStageV2 }
  from './substrate-federated-native-deposit-funding-stage-v2.js';
import type { NativeTwoCycleFailureBindingsV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';

const MAX_PUBLIC_BYTES = 16 * 1024;
const FAILURE_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_FAILURE_V1';
const FAILURE_KEYS = ['schema', 'version', 'status', 'configSha256Hex',
  'expectedBridgeCommit', 'failureClass', 'checks', 'boundaries',
  'receiptDigestHex'] as const;
const CHECK_KEYS = ['startRecordPresent', 'automaticRetryOrResumeEnabled',
  'postFailureIdentityCheckPassed'] as const;
const BOUNDARY_KEYS = ['rootCleanupEstablishedByTimeout',
  'startWithoutThisTerminalWouldBeAmbiguous', 'rawCausePublished'] as const;
const BINDING_KEYS = ['configSha256Hex', 'expectedBridgeCommit',
  'pathIdentityDigestHex'] as const;

type FileIdentity = Readonly<{ path: string; dev: bigint; ino: bigint;
  mode: bigint; nlink: bigint; size: bigint; mtimeNs: bigint; ctimeNs: bigint }>;
type DirectoryIdentity = Readonly<{ path: string; dev: bigint; ino: bigint;
  mode: bigint; nlink: bigint }>;
type SelectedFile = Readonly<{ identity: FileIdentity; bytes: Uint8Array }>;

function refuse(): never {
  throw new Error('native V2 public deposit funding stage evidence differs');
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (types.isProxy(value) || value === null || typeof value !== 'object'
      || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) refuse();
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some(key =>
    typeof key !== 'string' || !keys.includes(key))) refuse();
  const selected: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) refuse();
    selected[key] = descriptor.value;
  }
  return selected;
}

function lowerHex(value: unknown, bytes: number): value is string {
  return typeof value === 'string' && value.length === bytes * 2
    && /^[0-9a-f]+$/u.test(value);
}

function selectedBindings(value: unknown): Readonly<NativeTwoCycleFailureBindingsV1> {
  const fields = exactObject(value, BINDING_KEYS);
  if (!lowerHex(fields.configSha256Hex, 32)
      || !lowerHex(fields.expectedBridgeCommit, 20)
      || !lowerHex(fields.pathIdentityDigestHex, 32)) refuse();
  return Object.freeze({
    configSha256Hex: fields.configSha256Hex,
    expectedBridgeCommit: fields.expectedBridgeCommit,
    pathIdentityDigestHex: fields.pathIdentityDigestHex,
  });
}

function isEnoent(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error
    && error.code === 'ENOENT';
}

function directAttemptChain(attemptPath: string): readonly DirectoryIdentity[] {
  const chain: DirectoryIdentity[] = [];
  let path = resolve(attemptPath);
  while (true) {
    const stat = lstatSync(path, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()
        || canonicalPathIdentity(realpathSync.native(path))
          !== canonicalPathIdentity(path)) refuse();
    chain.push(Object.freeze({ path, dev: stat.dev, ino: stat.ino,
      mode: stat.mode, nlink: stat.nlink }));
    const parent = dirname(path);
    if (parent === path) break;
    path = parent;
  }
  return chain;
}

function sameChain(before: readonly DirectoryIdentity[],
  after: readonly DirectoryIdentity[]): boolean {
  return before.length === after.length && before.every((item, index) => {
    const current = after[index]!;
    return item.path === current.path && item.dev === current.dev
      && item.ino === current.ino && item.mode === current.mode
      && item.nlink === current.nlink;
  });
}

function fileIdentity(path: string): FileIdentity {
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) refuse();
  return Object.freeze({ path, dev: stat.dev, ino: stat.ino, mode: stat.mode,
    nlink: stat.nlink, size: stat.size, mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs });
}

function sameFile(left: FileIdentity, right: FileIdentity): boolean {
  return left.path === right.path && left.dev === right.dev && left.ino === right.ino
    && left.mode === right.mode && left.nlink === right.nlink
    && left.size === right.size && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function readSelected(attemptPath: string, name: string): SelectedFile {
  const path = join(attemptPath, name);
  const before = fileIdentity(path);
  const loaded = readBoundedRegularFile(path, 'native V2 public stage file',
    MAX_PUBLIC_BYTES);
  const after = fileIdentity(path);
  if (!sameFile(before, after)
      || canonicalPathIdentity(loaded.canonicalPath)
        !== canonicalPathIdentity(path)) refuse();
  return Object.freeze({ identity: after, bytes: loaded.bytes });
}

function stillSelected(files: readonly SelectedFile[], attemptPath: string,
  chain: readonly DirectoryIdentity[]): void {
  for (const file of files) {
    if (!sameFile(file.identity, fileIdentity(file.identity.path))) refuse();
  }
  if (!sameChain(chain, directAttemptChain(attemptPath))) refuse();
}

function absent(path: string): boolean {
  try { lstatSync(path, { bigint: true }); return false; }
  catch (error) { if (isEnoent(error)) return true; throw error; }
}

function publicText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) refuse();
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
    .decode(bytes);
  if (text.charCodeAt(0) === 0xfeff || text.includes('\r')
      || !text.endsWith('\n')) refuse();
  return text;
}

function terminalFailureDigest(bytes: Uint8Array,
  expected: Readonly<NativeTwoCycleFailureBindingsV1>): string {
  const text = publicText(bytes);
  assertNoDuplicateJsonKeys(text);
  const failure = exactObject(JSON.parse(text) as unknown, FAILURE_KEYS);
  const checks = exactObject(failure.checks, CHECK_KEYS);
  const boundaries = exactObject(failure.boundaries, BOUNDARY_KEYS);
  if (text !== canonicalJson(failure) + '\n'
      || failure.schema !== 'e2s.substrate-federated-native-two-cycle-failure.v1'
      || failure.version !== 1 || failure.status !== 'two_cycle_invocation_failed'
      || failure.configSha256Hex !== expected.configSha256Hex
      || failure.expectedBridgeCommit !== expected.expectedBridgeCommit
      || (failure.failureClass !== 'execution_failure'
        && failure.failureClass !== 'contained_process_failure'
        && failure.failureClass !== 'identity_validation_failure')
      || checks.startRecordPresent !== true
      || checks.automaticRetryOrResumeEnabled !== false
      || typeof checks.postFailureIdentityCheckPassed !== 'boolean'
      || boundaries.rootCleanupEstablishedByTimeout !== false
      || boundaries.startWithoutThisTerminalWouldBeAmbiguous !== true
      || boundaries.rawCausePublished !== false
      || !lowerHex(failure.receiptDigestHex, 32)) refuse();
  const { receiptDigestHex, ...body } = failure;
  if (sha256CanonicalJson(body, FAILURE_DOMAIN) !== receiptDigestHex) refuse();
  return receiptDigestHex;
}

export type NativeDepositFundingPublicStageReadV2 =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'validated'; stage: Readonly<NativeDepositFundingParentStageV2>;
    failureReceiptDigestHex: string }>;

/**
 * Read only the selected public failure graph. The caller must separately
 * establish original-process absence and select a V1 terminal failure with
 * result.json absent; this reader never checks result.json. An absent optional
 * companion says nothing about the funding stage or private cause.
 */
export function readOptionalNativeDepositFundingPublicStageV2(
  attemptPath: string,
  expectedBindings: Readonly<NativeTwoCycleFailureBindingsV1>,
): NativeDepositFundingPublicStageReadV2 {
  const expected = selectedBindings(expectedBindings);
  const attempt = resolve(attemptPath);
  const chain = directAttemptChain(attempt);
  const terminal = readSelected(attempt, 'failure.json');
  const failureReceiptDigestHex = terminalFailureDigest(terminal.bytes, expected);
  const parentPath = join(attempt, 'failure-deposit-funding-stage-v2.json');
  if (absent(parentPath)) {
    stillSelected([terminal], attempt, chain);
    if (!absent(parentPath)) refuse();
    return Object.freeze({ kind: 'absent' });
  }
  const workerFailure = readSelected(attempt, 'worker-failure.json');
  const workerRoot = readSelected(attempt, 'worker-root-phase-v2.json');
  const workerStep = readSelected(attempt, 'worker-cycle-step.json');
  const parentStep = readSelected(attempt, 'failure-cycle-step.json');
  const workerStage = readSelected(attempt, 'worker-deposit-funding-stage-v2.json');
  const parentStage = readSelected(attempt, 'failure-deposit-funding-stage-v2.json');
  const stage = parseNativeDepositFundingParentStageV2(parentStage.bytes, expected,
    failureReceiptDigestHex, {
      workerFailureText: publicText(workerFailure.bytes),
      workerRootPhaseV2Text: publicText(workerRoot.bytes),
      workerCycleStepText: publicText(workerStep.bytes),
      parentCycleStepText: publicText(parentStep.bytes),
      workerDepositFundingStageV2Text: publicText(workerStage.bytes),
    });
  stillSelected([terminal, workerFailure, workerRoot, workerStep,
    parentStep, workerStage, parentStage], attempt, chain);
  return Object.freeze({ kind: 'validated', stage, failureReceiptDigestHex });
}
