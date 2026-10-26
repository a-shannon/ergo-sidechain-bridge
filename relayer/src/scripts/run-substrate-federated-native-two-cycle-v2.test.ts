import { createHash } from 'node:crypto';
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, parse, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { canonicalJson, sha256CanonicalJson }
  from '../ergo-settlement-core/strict-json.js';
import { readBoundedRegularFile }
  from '../create-only-out-of-repository-artifact.js';
import { createNativeTwoCycleWorkerFailureDiagnosticV1 }
  from '../substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { createNativeTwoCycleWorkerRootPhaseV2 }
  from '../substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';
import { createNativeTwoCycleWorkerCycleStepV1,
  createNativeTwoCycleParentCycleStepV1 }
  from '../substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { createNativeDepositFundingWorkerStageV2,
  createNativeDepositFundingParentStageV2,
  parseNativeDepositFundingParentStageV2 }
  from '../substrate-federated-native-deposit-funding-stage-v2.js';
import { copiedSelectionEntryExists, tryPublishNativeDepositFundingParentStageV2 }
  from './run-substrate-federated-native-two-cycle-v2.js';

const v1 = readFileSync(new URL('./run-substrate-federated-native-two-cycle-v1.ts',
  import.meta.url), 'utf8');
const v2 = readFileSync(new URL('./run-substrate-federated-native-two-cycle-v2.ts',
  import.meta.url), 'utf8');
const TEST_TMP = resolve(process.env.ERGO_BRIDGE_TEST_TMP_ROOT ?? tmpdir());

function entryExists(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error
        && error.code === 'ENOENT') return false;
    throw error;
  }
}

describe('versioned V2 parent source boundary', () => {
  it('preserves V1 terminal failure and publishes V2 only after V1 lineage', () => {
    expect(createHash('sha256').update(v1).digest('hex'))
      .toBe('df4717b42292f8e351eead216ee75c1440af72f4001aac31750e33dc58544bd6');
    const body = (text: string) => text.slice(
      text.indexOf('const failureBody = Object.freeze({'),
      text.indexOf('const failure = Object.freeze({',
        text.indexOf('const failureBody = Object.freeze({')));
    expect(body(v2)).toBe(body(v1));
    expect(v2).toContain("'run-substrate-federated-native-two-cycle-worker-v2.ts'");
    const failure = v2.indexOf('writeNewFile(',
      v2.indexOf('const failure = Object.freeze({'));
    const step = v2.indexOf("writeNewFile(join(attemptPath, 'failure-cycle-step.json')");
    const stage = v2.lastIndexOf('tryPublishNativeDepositFundingParentStageV2(');
    expect(failure).toBeGreaterThanOrEqual(0);
    expect(failure).toBeLessThan(step);
    expect(step).toBeLessThan(stage);
    const preentry = v2.slice(0, v2.indexOf('const attemptPath = createAttemptDirectory'));
    expect(preentry).toContain("'worker-deposit-funding-stage-v2.json'");
    expect(preentry).toContain("'failure-deposit-funding-stage-v2.json'");
    const success = v2.slice(v2.indexOf("if (worker.stdout !== ''"),
      v2.indexOf('const retainedWasmEvidence'));
    expect(success).toContain("copiedSelectionEntryExists(join(attemptPath, 'worker-deposit-funding-stage-v2.json'))");
    expect(success).toContain("copiedSelectionEntryExists(join(attemptPath, 'failure-deposit-funding-stage-v2.json'))");
  });

  it('treats occupied links as present and access errors as indeterminate', () => {
    const path = 'synthetic-parent-v2-companion.json';
    expect(copiedSelectionEntryExists(path, () => ({ isSymbolicLink: () => true })))
      .toBe(true);
    expect(copiedSelectionEntryExists(path, () => {
      throw Object.assign(new Error('synthetic absent'), { code: 'ENOENT' });
    })).toBe(false);
    const denied = Object.assign(new Error('synthetic denied'), { code: 'EACCES' });
    let caught: unknown;
    try { copiedSelectionEntryExists(path, () => { throw denied; }); }
    catch (error) { caught = error; }
    expect(caught).toBe(denied);
  });

  it('writes only a joined public V2 companion from five direct stable ancestors', () => {
    const suite = mkdtempSync(join(TEST_TMP, 'bridge-parent-v2-public-fixture-'));
    const bindings = { configSha256Hex: 'a'.repeat(64),
      expectedBridgeCommit: 'b'.repeat(40), pathIdentityDigestHex: 'c'.repeat(64) };
    const failureBody = {
      schema: 'e2s.substrate-federated-native-two-cycle-failure.v1',
      version: 1, status: 'two_cycle_invocation_failed',
      configSha256Hex: bindings.configSha256Hex,
      expectedBridgeCommit: bindings.expectedBridgeCommit,
      failureClass: 'execution_failure',
      checks: { startRecordPresent: true, automaticRetryOrResumeEnabled: false,
        postFailureIdentityCheckPassed: true },
      boundaries: { rootCleanupEstablishedByTimeout: false,
        startWithoutThisTerminalWouldBeAmbiguous: true, rawCausePublished: false },
    } as const;
    const terminal = { ...failureBody, receiptDigestHex: sha256CanonicalJson(
      failureBody, 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_FAILURE_V1') };
    const terminalBytes = Buffer.from(canonicalJson(terminal) + '\n');
    const text = (value: unknown): string => canonicalJson(value) + '\n';
    const workerFailure = createNativeTwoCycleWorkerFailureDiagnosticV1(
      bindings, 'root-or-cleanup', new Error('opaque synthetic cause'));
    const workerRoot = createNativeTwoCycleWorkerRootPhaseV2(bindings,
      { primaryPhase: 'cycle-1', cleanupErrorCount: 0, ergoNodeStartupPhase: null });
    const workerStep = createNativeTwoCycleWorkerCycleStepV1(bindings,
      text(workerFailure), text(workerRoot), { cycle: 'cycle-1', step: 'deposit-funding' });
    const parentStep = createNativeTwoCycleParentCycleStepV1(bindings,
      terminal.receiptDigestHex, text(workerFailure), text(workerRoot), text(workerStep));
    const workerStage = createNativeDepositFundingWorkerStageV2(bindings, {
      workerFailureText: text(workerFailure), workerRootPhaseV2Text: text(workerRoot),
      workerCycleStepText: text(workerStep),
    }, { cycle: 'cycle-1', lastEnteredStage: 'owned-reward-input-discovery' });
    const ancestors = {
      'worker-failure.json': text(workerFailure),
      'worker-root-phase-v2.json': text(workerRoot),
      'worker-cycle-step.json': text(workerStep),
      'failure-cycle-step.json': text(parentStep),
      'worker-deposit-funding-stage-v2.json': text(workerStage),
    } as const;
    const casePaths: string[] = [];
    const createCase = (name: string, overrides: Record<string, string | null> = {}) => {
      const attempt = join(suite, name);
      mkdirSync(attempt);
      writeFileSync(join(attempt, 'failure.json'), terminalBytes, { flag: 'wx' });
      for (const [file, value] of Object.entries(ancestors)) {
        const selected = Object.hasOwn(overrides, file) ? overrides[file] : value;
        if (selected !== null) writeFileSync(join(attempt, file), selected, { flag: 'wx' });
      }
      casePaths.push(attempt);
      return attempt;
    };
    try {
      expect(Object.keys(terminal)).toHaveLength(9);
      const positive = createCase('positive');
      const readSelected = (name: string) => new TextDecoder('utf-8',
        { fatal: true, ignoreBOM: true }).decode(readBoundedRegularFile(
          join(positive, name), 'synthetic V2 selected ancestor', 16 * 1024).bytes);
      expect(createNativeDepositFundingParentStageV2(bindings,
        terminal.receiptDigestHex, {
          workerFailureText: readSelected('worker-failure.json'),
          workerRootPhaseV2Text: readSelected('worker-root-phase-v2.json'),
          workerCycleStepText: readSelected('worker-cycle-step.json'),
          parentCycleStepText: readSelected('failure-cycle-step.json'),
          workerDepositFundingStageV2Text:
            readSelected('worker-deposit-funding-stage-v2.json'),
        })).toBeDefined();
      const record = tryPublishNativeDepositFundingParentStageV2(
        positive, bindings, terminal.receiptDigestHex);
      expect(record).not.toBeNull();
      const output = join(positive, 'failure-deposit-funding-stage-v2.json');
      const outputBytes = readFileSync(output);
      expect(outputBytes.length).toBeLessThanOrEqual(16 * 1024);
      expect(outputBytes).toEqual(Buffer.from(text(record)));
      expect(parseNativeDepositFundingParentStageV2(outputBytes, bindings,
        terminal.receiptDigestHex, {
          workerFailureText: ancestors['worker-failure.json'],
          workerRootPhaseV2Text: ancestors['worker-root-phase-v2.json'],
          workerCycleStepText: ancestors['worker-cycle-step.json'],
          parentCycleStepText: ancestors['failure-cycle-step.json'],
          workerDepositFundingStageV2Text: ancestors['worker-deposit-funding-stage-v2.json'],
        })).toEqual(record);
      expect(record).toMatchObject({ status: 'last_entered_stage_observed',
        operationCompletionEstablished: false, rootCleanupEstablished: false,
        rawCausePublished: false, stageCauseEstablished: false, campaignAdmitted: false });

      const missing = createCase('missing', { 'worker-deposit-funding-stage-v2.json': null });
      expect(tryPublishNativeDepositFundingParentStageV2(
        missing, bindings, terminal.receiptDigestHex)).toBeNull();
      expect(existsSync(join(missing, 'failure-deposit-funding-stage-v2.json'))).toBe(false);
      const occupied = createCase('occupied');
      const sentinel = Buffer.from('occupied\n');
      writeFileSync(join(occupied, 'failure-deposit-funding-stage-v2.json'),
        sentinel, { flag: 'wx' });
      expect(tryPublishNativeDepositFundingParentStageV2(
        occupied, bindings, terminal.receiptDigestHex)).toBeNull();
      expect(readFileSync(join(occupied, 'failure-deposit-funding-stage-v2.json')))
        .toEqual(sentinel);
      const foreignRoot = createNativeTwoCycleWorkerRootPhaseV2(bindings,
        { primaryPhase: 'cycle-2', cleanupErrorCount: 0, ergoNodeStartupPhase: null });
      const foreignStep = createNativeTwoCycleWorkerCycleStepV1(bindings,
        text(workerFailure), text(foreignRoot), { cycle: 'cycle-2', step: 'deposit-funding' });
      const foreignWorker = createNativeDepositFundingWorkerStageV2(bindings, {
        workerFailureText: text(workerFailure),
        workerRootPhaseV2Text: text(foreignRoot),
        workerCycleStepText: text(foreignStep),
      }, { cycle: 'cycle-2', lastEnteredStage: 'held-funding-equality' });
      const foreign = createCase('foreign', {
        'worker-deposit-funding-stage-v2.json': text(foreignWorker) });
      expect(tryPublishNativeDepositFundingParentStageV2(
        foreign, bindings, terminal.receiptDigestHex)).toBeNull();
      const truncated = createCase('truncated', {
        'worker-deposit-funding-stage-v2.json': text(workerStage).slice(0, -2) });
      expect(tryPublishNativeDepositFundingParentStageV2(
        truncated, bindings, terminal.receiptDigestHex)).toBeNull();
      const linked = createCase('hardlink');
      linkSync(join(linked, 'worker-failure.json'), join(linked, 'worker-failure-alias.json'));
      expect(lstatSync(join(linked, 'worker-failure.json')).nlink).toBe(2);
      expect(tryPublishNativeDepositFundingParentStageV2(
        linked, bindings, terminal.receiptDigestHex)).toBeNull();
      for (const attempt of casePaths) {
        expect(readFileSync(join(attempt, 'failure.json'))).toEqual(terminalBytes);
      }
    } finally {
      const quarantine = resolve(parse(suite).root, 'A EFFACER');
      const target = join(quarantine, 'bridge-parent-v2-' + basename(suite));
      const relativeSource = relative(TEST_TMP, suite);
      if (relativeSource.startsWith('..') || relativeSource === ''
          || relativeSource.includes(':')
          || !lstatSync(TEST_TMP).isDirectory() || lstatSync(TEST_TMP).isSymbolicLink()
          || !lstatSync(suite).isDirectory() || lstatSync(suite).isSymbolicLink()) {
        throw new Error('fixture source boundary differs');
      }
      if (!entryExists(quarantine)) mkdirSync(quarantine);
      if (!lstatSync(quarantine).isDirectory()
          || lstatSync(quarantine).isSymbolicLink() || entryExists(target)) {
        throw new Error('fixture quarantine boundary differs');
      }
      renameSync(suite, target);
      if (entryExists(suite) || !lstatSync(target).isDirectory()) {
        throw new Error('fixture quarantine move did not complete');
      }
    }
  });
});
