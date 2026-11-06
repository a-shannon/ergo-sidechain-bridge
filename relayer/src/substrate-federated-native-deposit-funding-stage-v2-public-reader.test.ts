import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, parse, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { canonicalJson, sha256CanonicalJson }
  from './ergo-settlement-core/strict-json.js';
import { createNativeDepositFundingParentStageV2,
  createNativeDepositFundingWorkerStageV2,
  NATIVE_DEPOSIT_FUNDING_PARENT_STAGE_V2_DOMAIN }
  from './substrate-federated-native-deposit-funding-stage-v2.js';
import { readOptionalNativeDepositFundingPublicStageV2 }
  from './substrate-federated-native-deposit-funding-stage-v2-public-reader.js';
import { createNativeTwoCycleWorkerCycleStepV1,
  createNativeTwoCycleParentCycleStepV1 }
  from './substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { createNativeTwoCycleWorkerFailureDiagnosticV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { createNativeTwoCycleWorkerRootPhaseV2 }
  from './substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';

const TEST_TMP = resolve(process.env.ERGO_BRIDGE_TEST_TMP_ROOT ?? tmpdir());
const bindings = Object.freeze({ configSha256Hex: 'a'.repeat(64),
  expectedBridgeCommit: 'b'.repeat(40), pathIdentityDigestHex: 'c'.repeat(64) });
const text = (value: unknown): string => canonicalJson(value) + '\n';

function selectedRecords(): Readonly<Record<string, string>> {
  const workerFailure = createNativeTwoCycleWorkerFailureDiagnosticV1(bindings,
    'root-or-cleanup', new Error('unpublished synthetic cause'));
  const workerFailureText = text(workerFailure);
  const root = createNativeTwoCycleWorkerRootPhaseV2(bindings,
    { primaryPhase: 'cycle-1', cleanupErrorCount: 0, ergoNodeStartupPhase: null });
  const rootText = text(root);
  const workerStep = createNativeTwoCycleWorkerCycleStepV1(bindings,
    workerFailureText, rootText, { cycle: 'cycle-1', step: 'deposit-funding' });
  const workerStepText = text(workerStep);
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
  const failure = Object.freeze({ ...failureBody,
    receiptDigestHex: sha256CanonicalJson(failureBody,
      'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_FAILURE_V1') });
  const parentStep = createNativeTwoCycleParentCycleStepV1(bindings,
    failure.receiptDigestHex, workerFailureText, rootText, workerStepText);
  const workerStage = createNativeDepositFundingWorkerStageV2(bindings,
    { workerFailureText, workerRootPhaseV2Text: rootText,
      workerCycleStepText: workerStepText },
    { cycle: 'cycle-1', lastEnteredStage: 'owned-reward-input-discovery' });
  const parentStage = createNativeDepositFundingParentStageV2(bindings,
    failure.receiptDigestHex, {
      workerFailureText, workerRootPhaseV2Text: rootText,
      workerCycleStepText: workerStepText, parentCycleStepText: text(parentStep),
      workerDepositFundingStageV2Text: text(workerStage),
    });
  return Object.freeze({
    'failure.json': text(failure),
    'worker-failure.json': workerFailureText,
    'worker-root-phase-v2.json': rootText,
    'worker-cycle-step.json': workerStepText,
    'failure-cycle-step.json': text(parentStep),
    'worker-deposit-funding-stage-v2.json': text(workerStage),
    'failure-deposit-funding-stage-v2.json': text(parentStage),
  });
}

function entryExists(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error
        && error.code === 'ENOENT') return false;
    throw error;
  }
}

function quarantineSuite(suite: string): void {
  const source = resolve(suite);
  const quarantine = resolve(parse(source).root, 'A EFFACER');
  const destination = join(quarantine, 'bridge-v2-public-reader-' + basename(source));
  const relativeSource = relative(TEST_TMP, source);
  if (relativeSource.startsWith('..') || relativeSource === ''
      || relativeSource.includes(':')
      || !lstatSync(TEST_TMP).isDirectory() || lstatSync(TEST_TMP).isSymbolicLink()
      || !lstatSync(source).isDirectory() || lstatSync(source).isSymbolicLink()) {
    throw new Error('synthetic V2 reader fixture source is indirect');
  }
  if (!entryExists(quarantine)) mkdirSync(quarantine);
  if (!lstatSync(quarantine).isDirectory()
      || lstatSync(quarantine).isSymbolicLink() || entryExists(destination)) {
    throw new Error('synthetic V2 reader quarantine is occupied or indirect');
  }
  renameSync(source, destination);
  if (entryExists(source) || !lstatSync(destination).isDirectory()) {
    throw new Error('synthetic V2 reader quarantine move failed');
  }
}

function writeAttempt(suite: string, name: string,
  records: Readonly<Record<string, string>>,
  omitted?: string): string {
  const attempt = join(suite, name);
  mkdirSync(attempt);
  for (const [filename, value] of Object.entries(records)) {
    if (filename !== omitted) writeFileSync(join(attempt, filename), value, { flag: 'wx' });
  }
  return attempt;
}

describe.skipIf(process.platform !== 'win32' || process.arch !== 'x64')(
  'bounded V2 public funding-stage reader', () => {
    it('validates only the selected canonical public failure graph', () => {
      const suite = mkdtempSync(join(TEST_TMP, 'bridge-v2-reader-'));
      try {
        const records = selectedRecords();
        const attempt = writeAttempt(suite, 'positive', records);
        const observed = readOptionalNativeDepositFundingPublicStageV2(attempt, bindings);
        expect(observed.kind).toBe('validated');
        if (observed.kind !== 'validated') throw new Error('expected validated stage');
        expect(observed.stage).toMatchObject({
          cycle: 'cycle-1', step: 'deposit-funding',
          lastEnteredStage: 'owned-reward-input-discovery',
          operationCompletionEstablished: false, rootCleanupEstablished: false,
          rawCausePublished: false, stageCauseEstablished: false,
          campaignAdmitted: false,
        });
        expect(observed.stage.failureReceiptDigestHex)
          .toBe(JSON.parse(records['failure.json']!).receiptDigestHex);
        expect(Object.values(records).join('')).not.toContain('unpublished synthetic cause');
        for (const [name, value] of Object.entries(records)) {
          expect(readFileSync(join(attempt, name), 'utf8')).toBe(value);
        }
      } finally { quarantineSuite(suite); }
    });

    it('reports optional absence without inferring a stage or cause', () => {
      const suite = mkdtempSync(join(TEST_TMP, 'bridge-v2-reader-'));
      try {
        const records = selectedRecords();
        const attempt = writeAttempt(suite, 'absent', records,
          'failure-deposit-funding-stage-v2.json');
        expect(readOptionalNativeDepositFundingPublicStageV2(attempt, bindings))
          .toEqual({ kind: 'absent' });
        expect(existsSync(join(attempt, 'failure.json'))).toBe(true);
      } finally { quarantineSuite(suite); }
    });

    it('rejects re-signed terminal drift, changed stage, invalid bytes and linked evidence', () => {
      const suite = mkdtempSync(join(TEST_TMP, 'bridge-v2-reader-'));
      try {
        const records = selectedRecords();
        const changedFailure = JSON.parse(records['failure.json']!) as Record<string, unknown>;
        const { receiptDigestHex: ignored, ...body } = changedFailure;
        void ignored;
        const alternateBody = { ...body, failureClass: 'identity_validation_failure' };
        const alternateFailure = text({ ...alternateBody,
          receiptDigestHex: sha256CanonicalJson(alternateBody,
            'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_FAILURE_V1') });
        const terminalDrift = writeAttempt(suite, 'terminal-drift',
          { ...records, 'failure.json': alternateFailure });
        expect(() => readOptionalNativeDepositFundingPublicStageV2(
          terminalDrift, bindings)).toThrow();

        const changedStage = JSON.parse(
          records['failure-deposit-funding-stage-v2.json']!,
        ) as Record<string, unknown>;
        const { receiptDigestHex: oldDigest, ...stageBody } = changedStage;
        void oldDigest;
        const alternateStageBody = { ...stageBody,
          lastEnteredStage: 'held-funding-equality' };
        const alternateStage = text({ ...alternateStageBody,
          receiptDigestHex: sha256CanonicalJson(alternateStageBody,
            NATIVE_DEPOSIT_FUNDING_PARENT_STAGE_V2_DOMAIN) });
        const stageDrift = writeAttempt(suite, 'stage-drift',
          { ...records, 'failure-deposit-funding-stage-v2.json': alternateStage });
        expect(() => readOptionalNativeDepositFundingPublicStageV2(
          stageDrift, bindings)).toThrow();

        const bom = writeAttempt(suite, 'bom', records);
        writeFileSync(join(bom, 'failure.json'),
          Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]),
            Buffer.from(records['failure.json']!)]));
        expect(() => readOptionalNativeDepositFundingPublicStageV2(bom, bindings)).toThrow();

        const oversized = writeAttempt(suite, 'oversized', records);
        writeFileSync(join(oversized, 'worker-cycle-step.json'),
          Buffer.alloc(16 * 1024 + 1, 0x61));
        expect(() => readOptionalNativeDepositFundingPublicStageV2(
          oversized, bindings)).toThrow();

        const linked = writeAttempt(suite, 'linked', records);
        linkSync(join(linked, 'failure-deposit-funding-stage-v2.json'),
          join(linked, 'same-file-alias'));
        expect(() => readOptionalNativeDepositFundingPublicStageV2(linked, bindings))
          .toThrow();
      } finally { quarantineSuite(suite); }
    });
  });
