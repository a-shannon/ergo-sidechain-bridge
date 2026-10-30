import { createHash, randomBytes } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { runBoundedProcess, BoundedProcessExitError } from '../bounded-process-runner.js';
import { loadAuthenticatedV2CompilerLock } from '../authenticated-v2-source-tree-conformance.js';
import { hashAuthenticatedV2RuntimeBundlePackageLock,
  validateAuthenticatedV2RuntimeBundleBuildParentLock }
  from '../authenticated-v2-runtime-bundle.js';
import { ORIGINAL_NODE_OPTIONS } from '../test-node-env.js';
import { canonicalJson, sha256CanonicalJson } from '../ergo-settlement-core/strict-json.js';
import { createNativeTwoCycleParentCycleStepV1 }
  from '../substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { createNativeTwoCycleWorkerFailureDiagnosticV1 }
  from '../substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { createNativeTwoCycleWorkerRootPhaseV1 }
  from '../substrate-federated-native-two-cycle-root-phase-diagnostic-v1.js';
import { createNativeTwoCycleWorkerRootPhaseV2 }
  from '../substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';
import { createNativeTwoCycleWorkerCycleStepV1 }
  from '../substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { NATIVE_DEPOSIT_FUNDING_SUBSTAGES_V1,
  createNativeDepositFundingSubstageTaggerV1, createNativeTwoCycleWorkerDepositFundingSubstageV1 }
  from '../substrate-federated-native-deposit-funding-substage-v1.js';
import { tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2 }
  from '../substrate-federated-native-two-cycle-root-phase-v2.js';
import { tagNativeTwoCycleCycleStepFailureV1 }
  from '../substrate-federated-native-two-cycle-cycle-step-v1.js';
import { parseNativeDepositFundingWorkerStageV2 }
  from '../substrate-federated-native-deposit-funding-stage-v2.js';
import { readOptionalNativeDepositFundingPublicStageV2 }
  from '../substrate-federated-native-deposit-funding-stage-v2-public-reader.js';
import { createNativeTwoCyclePublicFailureLatchV2, publishNativeTwoCycleWorkerPublicFailureV2 }
  from '../substrate-federated-native-two-cycle-worker-public-failure-seam-v2.js';
import { tryPublishNativeDepositFundingParentStageV2 }
  from './run-substrate-federated-native-two-cycle-v2.js';

const BRIDGE_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const TEST_ROOT = resolve(process.env.ERGO_BRIDGE_TEST_TMP_ROOT
  ?? join(dirname(BRIDGE_ROOT), 'diagnostics', 'v2-public-failure-process-seam'));
const BINDINGS = Object.freeze({ configSha256Hex: 'a'.repeat(64),
  expectedBridgeCommit: 'b'.repeat(40), pathIdentityDigestHex: 'c'.repeat(64) });
const text = (value: unknown): string => canonicalJson(value) + '\n';
const STAGE = 'owned-reward-input-discovery' as const;
const OPAQUE_CAUSE = 'synthetic-private-cause-never-published';
const SAME_THROW_MARKER = 'BRIDGE_V2_SYNTHETIC_SAME_ERROR\n';
const SENTINEL = Buffer.from('occupied\n');

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function packageDigest(root: string): string {
  const records: string[] = [];
  const visit = (cursor: string): void => {
    for (const entry of readdirSync(cursor, { withFileTypes: true })) {
      const path = join(cursor, entry.name);
      if (entry.isSymbolicLink()) throw new Error('process seam loader package is indirect');
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) records.push(
        relative(root, path).replace(/\\/g, '/') + ':' + sha256File(path));
      else throw new Error('process seam loader package entry differs');
    }
  };
  visit(root);
  if (records.length === 0) throw new Error('process seam loader package is empty');
  return createHash('sha256').update(records.sort().join('\n')).digest('hex');
}

function pinnedLauncher() {
  const { lock: compilerLock } = loadAuthenticatedV2CompilerLock(BRIDGE_ROOT);
  const runtimeLockPath = join(BRIDGE_ROOT, 'sources',
    'authenticated-v2-runtime-bundle-build-lock-v2.json');
  expect(realpathSync(runtimeLockPath)).toBe(runtimeLockPath);
  expect(lstatSync(runtimeLockPath).isSymbolicLink()).toBe(false);
  expect(sha256File(runtimeLockPath))
    .toBe('7c635d225b02ede4e37edad09b6e2b9fb0f0dc3cb021dee985547142ae80e329');
  const lock = validateAuthenticatedV2RuntimeBundleBuildParentLock(
    JSON.parse(readFileSync(runtimeLockPath, 'utf8')) as unknown);
  const executablePath = realpathSync(process.execPath);
  expect(process.version).toBe('v' + compilerLock.nodeVersion);
  expect(process.platform + '-' + process.arch).toBe(compilerLock.platform);
  expect(sha256File(executablePath)).toBe(compilerLock.nodeExecutableSha256);
  expect(hashAuthenticatedV2RuntimeBundlePackageLock(
    readFileSync(join(BRIDGE_ROOT, 'relayer', 'package-lock.json'))))
    .toBe(lock.relayerPackageLockSha256);
  const modules = realpathSync(join(BRIDGE_ROOT, 'relayer', 'node_modules'));
  expect(lstatSync(join(BRIDGE_ROOT, 'relayer', 'node_modules')).isSymbolicLink()).toBe(false);
  for (const entry of lock.parentRuntimePackages) {
    const path = resolve(BRIDGE_ROOT, entry.path);
    expect(realpathSync(path)).toBe(path);
    expect(lstatSync(path).isSymbolicLink()).toBe(false);
    const inside = relative(modules, path);
    expect(inside !== '' && !inside.startsWith('..') && !isAbsolute(inside)).toBe(true);
    expect(packageDigest(path)).toBe(entry.sha256);
  }
  const tsx = lock.parentRuntimePackages.find(entry => entry.path === 'relayer/node_modules/tsx');
  if (!tsx) throw new Error('process seam loader is not pinned');
  const tsxRoot = resolve(BRIDGE_ROOT, tsx.path);
  const inheritedKeys = Object.keys(process.env);
  const nodeOptionKeys = inheritedKeys.filter(key => key.toUpperCase() === 'NODE_OPTIONS');
  if (ORIGINAL_NODE_OPTIONS !== undefined || nodeOptionKeys.length !== 1
      || process.env[nodeOptionKeys[0]!] !== '--no-deprecation') {
    throw new Error('process seam Vitest NODE_OPTIONS differs from its setup');
  }
  for (const key of lock.forbiddenParentEnvironmentOverrides) {
    if (key.toUpperCase() !== 'NODE_OPTIONS'
        && inheritedKeys.some(name => name.toUpperCase() === key.toUpperCase())) {
      throw new Error('process seam inherited Node override');
    }
  }
  const env = { ...process.env };
  for (const key of nodeOptionKeys) delete env[key];
  return { executablePath, env, loaderArgs: [
    '--require', join(tsxRoot, 'dist', 'preflight.cjs'),
    '--import', pathToFileURL(join(tsxRoot, 'dist', 'loader.mjs')).href,
  ] };
}

function quarantine(suite: string): void {
  const inside = relative(TEST_ROOT, suite);
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)
      || lstatSync(suite).isSymbolicLink() || !lstatSync(suite).isDirectory()) {
    throw new Error('process seam fixture source differs');
  }
  const quarantineRoot = resolve(parse(suite).root, 'A EFFACER');
  if (!existsSync(quarantineRoot)) mkdirSync(quarantineRoot);
  if (lstatSync(quarantineRoot).isSymbolicLink()
      || !lstatSync(quarantineRoot).isDirectory()) {
    throw new Error('process seam quarantine differs');
  }
  const target = join(quarantineRoot, 'bridge-v2-public-process-' + basename(suite));
  if (existsSync(target)) throw new Error('process seam quarantine is occupied');
  renameSync(suite, target);
  expect(existsSync(suite)).toBe(false);
  expect(lstatSync(target).isDirectory()).toBe(true);
}

function taggedFailure(): Error {
  const failure = new Error(OPAQUE_CAUSE);
  tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(failure, 'cycle-1');
  tagNativeTwoCycleCycleStepFailureV1(failure, 'cycle-1', 'deposit-funding');
  return failure;
}

function publishTerminal(attempt: string, contained = false) {
  const body = {
    schema: 'e2s.substrate-federated-native-two-cycle-failure.v1',
    version: 1, status: 'two_cycle_invocation_failed',
    configSha256Hex: BINDINGS.configSha256Hex,
    expectedBridgeCommit: BINDINGS.expectedBridgeCommit,
    failureClass: contained ? 'contained_process_failure' : 'execution_failure',
    checks: { startRecordPresent: true, automaticRetryOrResumeEnabled: false,
      postFailureIdentityCheckPassed: true },
    boundaries: { rootCleanupEstablishedByTimeout: false,
      startWithoutThisTerminalWouldBeAmbiguous: true, rawCausePublished: false },
  } as const;
  const terminal = { ...body, receiptDigestHex: sha256CanonicalJson(body,
    'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_FAILURE_V1') };
  expect(Object.keys(terminal)).toHaveLength(9);
  writeFileSync(join(attempt, 'failure.json'), text(terminal), { flag: 'wx' });
  return terminal;
}

function publishParentStep(attempt: string, terminal: ReturnType<typeof publishTerminal>): void {
  const read = (name: string) => readFileSync(join(attempt, name), 'utf8');
  const step = createNativeTwoCycleParentCycleStepV1(BINDINGS,
    terminal.receiptDigestHex, read('worker-failure.json'),
    read('worker-root-phase-v2.json'), read('worker-cycle-step.json'));
  writeFileSync(join(attempt, 'failure-cycle-step.json'), text(step), { flag: 'wx' });
}

function assertOriginalAbsent(controlPath: string, nonce: string): void {
  const control = JSON.parse(readFileSync(controlPath, 'utf8')) as { pid: number; nonce: string };
  expect(Object.keys(control).sort()).toEqual(['nonce', 'pid']);
  expect(control.nonce).toBe(nonce);
  expect(Number.isSafeInteger(control.pid) && control.pid > 0).toBe(true);
  expect(control.pid).not.toBe(process.pid);
  let absent = false;
  try { process.kill(control.pid, 0); }
  catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error
        && error.code === 'ESRCH') absent = true;
    else throw error;
  }
  expect(absent).toBe(true);
}

function assertNoRawCause(attempt: string): void {
  for (const entry of readdirSync(attempt)) {
    expect(entry).toMatch(/^(worker-|failure)/);
    expect(readFileSync(join(attempt, entry), 'utf8')).not.toContain(OPAQUE_CAUSE);
  }
  expect(existsSync(join(attempt, 'result.json'))).toBe(false);
}

describe('V2 shared public failure seam across a real bounded child', () => {
  it('preserves V1 bytes for all eight finite callback stages with fresh direct fixtures', () => {
    mkdirSync(TEST_ROOT, { recursive: true });
    const suite = mkdtempSync(join(TEST_ROOT, 'finite-'));
    try {
      for (const stage of NATIVE_DEPOSIT_FUNDING_SUBSTAGES_V1) {
        const attempt = join(suite, stage);
        mkdirSync(attempt);
        const failure = taggedFailure();
        createNativeDepositFundingSubstageTaggerV1()(failure, stage);
        const latch = createNativeTwoCyclePublicFailureLatchV2();
        latch.observe('cycle-1', stage);
        const published = publishNativeTwoCycleWorkerPublicFailureV2(
          attempt, BINDINGS, 'root-or-cleanup', failure, latch.selected());
        const expectedFailure = createNativeTwoCycleWorkerFailureDiagnosticV1(
          BINDINGS, 'root-or-cleanup', failure);
        const expectedRootV1 = createNativeTwoCycleWorkerRootPhaseV1(BINDINGS,
          { primaryPhase: 'cycle-1', cleanupErrorCount: 0 });
        const expectedRootV2 = createNativeTwoCycleWorkerRootPhaseV2(BINDINGS,
          { primaryPhase: 'cycle-1', cleanupErrorCount: 0, ergoNodeStartupPhase: null });
        const expectedStep = createNativeTwoCycleWorkerCycleStepV1(BINDINGS,
          text(expectedFailure), text(expectedRootV2),
          { cycle: 'cycle-1', step: 'deposit-funding' });
        const lineage = { workerFailureText: text(expectedFailure),
          workerRootPhaseV2Text: text(expectedRootV2), workerCycleStepText: text(expectedStep) };
        const expectedSubstage = createNativeTwoCycleWorkerDepositFundingSubstageV1(
          BINDINGS, lineage, stage);
        for (const [name, expected] of Object.entries({
          'worker-failure.json': expectedFailure, 'worker-root-phase.json': expectedRootV1,
          'worker-root-phase-v2.json': expectedRootV2, 'worker-cycle-step.json': expectedStep,
          'worker-deposit-funding-substage.json': expectedSubstage,
        })) expect(readFileSync(join(attempt, name))).toEqual(Buffer.from(text(expected)));
        expect(published).toEqual(lineage);
        const observed = parseNativeDepositFundingWorkerStageV2(readFileSync(
          join(attempt, 'worker-deposit-funding-stage-v2.json')), BINDINGS, lineage,
          { cycle: 'cycle-1', lastEnteredStage: stage });
        expect(observed).toMatchObject({ cycle: 'cycle-1', lastEnteredStage: stage,
          operationCompletionEstablished: false, rootCleanupEstablished: false,
          rawCausePublished: false, stageCauseEstablished: false, campaignAdmitted: false });
        assertNoRawCause(attempt);
      }
    } finally { quarantine(suite); }
  });

  it.each(['positive', 'cleared', 'primitive', 'proxy', 'occupied-worker',
    'occupied-parent', 'lineage-drift', 'timeout'] as const)(
    'joins or refuses the isolated %s child without changing terminal bytes',
    async mode => {
      mkdirSync(TEST_ROOT, { recursive: true });
      const suite = mkdtempSync(join(TEST_ROOT, mode + '-'));
      const attempt = join(suite, 'public');
      const control = join(suite, 'test-control.json');
      const child = join(suite, 'synthetic-child.mts');
      const nonce = randomBytes(32).toString('hex');
      mkdirSync(attempt);
      const moduleUrl = (name: string) => pathToFileURL(
        resolve(import.meta.dirname, '..', name)).href;
      const source = [
        "import { writeFileSync } from 'node:fs';",
        "import { join } from 'node:path';",
        "import { createNativeTwoCyclePublicFailureLatchV2, publishNativeTwoCycleWorkerPublicFailureV2 } from "
          + JSON.stringify(moduleUrl('substrate-federated-native-two-cycle-worker-public-failure-seam-v2.ts')) + ';',
        "import { tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2 } from "
          + JSON.stringify(moduleUrl('substrate-federated-native-two-cycle-root-phase-v2.ts')) + ';',
        "import { tagNativeTwoCycleCycleStepFailureV1 } from "
          + JSON.stringify(moduleUrl('substrate-federated-native-two-cycle-cycle-step-v1.ts')) + ';',
        'const [attempt, control, nonce, mode] = process.argv.slice(2);',
        "writeFileSync(control, JSON.stringify({ pid: process.pid, nonce }) + '\\n', { flag: 'wx' });",
        "if (mode === 'timeout') await new Promise(() => { setInterval(() => {}, 1000); });",
        'const bindings = ' + JSON.stringify(BINDINGS) + ';',
        'const latch = createNativeTwoCyclePublicFailureLatchV2();',
        "latch.observe('cycle-1', " + JSON.stringify(STAGE) + ');',
        "if (mode === 'cleared') latch.observe('cycle-1', null);",
        'const error = new Error(' + JSON.stringify(OPAQUE_CAUSE) + ');',
        "tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(error, 'cycle-1');",
        "tagNativeTwoCycleCycleStepFailureV1(error, 'cycle-1', 'deposit-funding');",
        "const failure = mode === 'primitive' ? 7 : mode === 'proxy' ? new Proxy(error, {",
        "  get() { throw new Error('proxy trap'); },",
        "  getPrototypeOf() { throw new Error('proxy trap'); } }) : error;",
        "if (mode === 'occupied-worker') writeFileSync(join(attempt,",
        "  'worker-deposit-funding-stage-v2.json'), 'occupied\\n', { flag: 'wx' });",
        'try {',
        '  try { throw failure; } catch (primaryFailure) {',
        "    publishNativeTwoCycleWorkerPublicFailureV2(attempt, bindings, 'root-or-cleanup',",
        '      primaryFailure, latch.selected());',
        '    throw primaryFailure;',
        '  }',
        '} catch (rethrown) {',
        '  if (rethrown === failure) {',
        '    process.stdout.write(' + JSON.stringify(SAME_THROW_MARKER) + ');',
        '    process.exitCode = 41;',
        '  } else { process.exitCode = 42; }',
        '}',
      ].join('\n') + '\n';
      writeFileSync(child, source, { flag: 'wx' });
      try {
        const launcher = pinnedLauncher();
        let caught: unknown;
        try {
          await runBoundedProcess({ ...launcher,
            args: [...launcher.loaderArgs, child, attempt, control, nonce, mode],
            cwd: join(BRIDGE_ROOT, 'relayer'), timeoutMs: mode === 'timeout' ? 15_000 : 30_000,
            terminationGraceMs: 10_000, maxOutputBytes: 16 * 1024,
            maxStdoutBytes: 1024, maxStderrBytes: 15 * 1024,
            label: 'synthetic V2 public failure child' });
        } catch (error) { caught = error; }
        if (mode === 'timeout') {
          expect(caught).toBeInstanceOf(Error);
          expect((caught as Error).message).toBe('synthetic V2 public failure child timed out');
        } else {
          expect(caught).toBeInstanceOf(BoundedProcessExitError);
          expect((caught as BoundedProcessExitError).exitCode)
            .toBe(process.platform === 'win32' ? 198 : 41);
          expect((caught as BoundedProcessExitError).stdout).toBe(SAME_THROW_MARKER);
          expect((caught as BoundedProcessExitError).stderr).toBe('');
        }
        // This host probe is independent of the public reader and runner's containment result.
        assertOriginalAbsent(control, nonce);
        expect(existsSync(join(attempt, 'result.json'))).toBe(false);
        const terminal = publishTerminal(attempt, mode === 'timeout');
        const terminalBytes = readFileSync(join(attempt, 'failure.json'));
        if (!['primitive', 'proxy', 'timeout'].includes(mode)) {
          publishParentStep(attempt, terminal);
        }
        if (mode === 'lineage-drift') {
          const path = join(attempt, 'worker-deposit-funding-stage-v2.json');
          writeFileSync(path, readFileSync(path, 'utf8').replace(
            '"lastEnteredStage":"' + STAGE + '"',
            '"lastEnteredStage":"held-funding-equality"'));
        }
        if (mode === 'occupied-parent') writeFileSync(
          join(attempt, 'failure-deposit-funding-stage-v2.json'), SENTINEL, { flag: 'wx' });
        const published = tryPublishNativeDepositFundingParentStageV2(
          attempt, BINDINGS, terminal.receiptDigestHex);
        if (mode === 'positive') {
          expect(published).toMatchObject({ cycle: 'cycle-1', lastEnteredStage: STAGE,
            operationCompletionEstablished: false, rootCleanupEstablished: false,
            rawCausePublished: false, stageCauseEstablished: false, campaignAdmitted: false });
          const read = readOptionalNativeDepositFundingPublicStageV2(attempt, BINDINGS);
          expect(read).toEqual({ kind: 'validated', stage: published,
            failureReceiptDigestHex: terminal.receiptDigestHex });
        } else {
          expect(published).toBeNull();
          if (mode === 'occupied-parent') {
            expect(readFileSync(join(attempt, 'failure-deposit-funding-stage-v2.json')))
              .toEqual(SENTINEL);
            expect(() => readOptionalNativeDepositFundingPublicStageV2(attempt, BINDINGS))
              .toThrow();
          } else {
            expect(readOptionalNativeDepositFundingPublicStageV2(attempt, BINDINGS))
              .toEqual({ kind: 'absent' });
          }
        }
        if (mode === 'occupied-worker') expect(readFileSync(
          join(attempt, 'worker-deposit-funding-stage-v2.json'))).toEqual(SENTINEL);
        if (mode === 'timeout') expect(readdirSync(attempt)).toEqual(['failure.json']);
        expect(readFileSync(join(attempt, 'failure.json'))).toEqual(terminalBytes);
        assertNoRawCause(attempt);
      } finally { quarantine(suite); }
    }, 120_000);
});
