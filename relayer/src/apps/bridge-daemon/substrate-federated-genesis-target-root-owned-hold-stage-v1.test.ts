import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { types } from 'node:util';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { canonicalJson, sha256CanonicalJson } from '../../ergo-settlement-core/strict-json.js';
import { NATIVE_DEPOSIT_FUNDING_SUBSTAGES_V1,
  type NativeDepositFundingSubstageV1 } from '../../substrate-federated-native-deposit-funding-substage-v1.js';
import { createNativeTwoCyclePublicFailureLatchV2 } from '../../substrate-federated-native-two-cycle-worker-public-failure-seam-v2.js';
import { createNativeTwoCycleWorkerFailureDiagnosticV1 } from '../../substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { createNativeTwoCycleWorkerRootPhaseV2 } from '../../substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';
import { createNativeTwoCycleWorkerCycleStepV1,
  createNativeTwoCycleParentCycleStepV1 } from '../../substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 } from '../../substrate-federated-native-two-cycle-root-phase-v1.js';
import { tagNativeTwoCycleCycleStepFailureV1 } from '../../substrate-federated-native-two-cycle-cycle-step-v1.js';
import { encodeNativeDepositFundingStageV2, parseNativeDepositFundingStageV2,
  selectNativeDepositFundingWorkerStageV2, createNativeDepositFundingParentStageV2,
  parseNativeDepositFundingParentStageV2 } from '../../substrate-federated-native-deposit-funding-stage-v2.js';
import type { SubstrateFederatedOwnedMiningHoldBoundaryV1,
  SubstrateFederatedOwnedMiningHoldObserverV1 } from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';

const root = ts.createSourceFile('root.ts', readFileSync(new URL(
  './substrate-federated-genesis-target-root-v1.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const codec = ts.createSourceFile('codec.ts', readFileSync(new URL(
  '../../substrate-federated-native-deposit-funding-stage-v2.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const bindings = Object.freeze({ configSha256Hex: 'a'.repeat(64), expectedBridgeCommit: 'b'.repeat(40),
  pathIdentityDigestHex: 'c'.repeat(64) });
const failureDigest = 'd'.repeat(64);
const text = (value: unknown) => canonicalJson(value) + '\n';
type Cycle = 'cycle-1' | 'cycle-2';
type Mark = (stage: NativeDepositFundingSubstageV1) => void;
type Hold = (target: object, observe?: SubstrateFederatedOwnedMiningHoldObserverV1) => Promise<object>;
const boundaries: readonly SubstrateFederatedOwnedMiningHoldBoundaryV1[] = [
  'target-admission', 'owner-precondition', 'control-precondition', 'operation-reservation',
  'hold-request', 'hold-response-policy', 'hold-response-body', 'hold-response-decode',
  'control-postactive', 'hold-wire-parse', 'owner-post-control-active', 'paired-snapshot-read',
  'paired-watermark-validation', 'paired-canonical-read', 'ancestry-validation', 'lag-poll',
  'stability-wait', 'stability-validation', 'owner-post-snapshot-active', 'post-hold-active',
];
const legacyStages = Object.freeze(['owned-transaction-hold', 'post-hold-owner-custody-guard',
  'prior-confirmation-revalidation', 'post-revalidation-owner-custody-guard',
  'owned-reward-input-discovery', 'post-discovery-owner-custody-guard',
  'owned-reward-input-provenance', 'held-funding-equality'] as const);

function declaration(source: ts.SourceFile, name: string): ts.FunctionDeclaration {
  const matches = source.statements.filter((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(matches.length, 1); assert(matches[0]!.body);
  return matches[0]!;
}
function compile(source: string): string {
  const output = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  assert(!/\brequire\s*\(/u.test(output), 'Root test compartments must remain import-free');
  return output;
}
const mapBody = declaration(root, 'createOwnedHoldFundingStageObserver').getText(root);
const rootBody = declaration(root, 'runSelectedGenesisTargetRoot').body!;
const marks = ['reportDepositFundingStage', 'markDepositFundingSubstage', 'markStep'].map(name => {
  const matches = rootBody.statements.filter(ts.isVariableStatement).filter(statement =>
    statement.declarationList.declarations.some(item => ts.isIdentifier(item.name) && item.name.text === name));
  assert.equal(matches.length, 1);
  return matches[0]!.getText(root);
}).join('\n');
const slices: string[] = [];
function collectSlices(node: ts.Node): void {
  if (ts.isVariableStatement(node) && node.declarationList.declarations.some(item =>
    ts.isIdentifier(item.name) && item.name.text === 'heldDepositSnapshot')) {
    assert(ts.isBlock(node.parent));
    const siblings = node.parent.statements;
    const index = siblings.indexOf(node);
    const slice = siblings.slice(index - 1, index + 3).map(item => item.getText(root)).join('\n');
    assert(slice.includes("markDepositFundingSubstage('owned-transaction-hold')"));
    assert(slice.includes("markDepositFundingSubstage('post-hold-owner-custody-guard')"));
    slices.push(slice);
  }
  ts.forEachChild(node, collectSlices);
}
collectSlices(root);
assert.equal(slices.length, 2, 'both actual native deposit Hold call sites are exercised');

function rootSeam(cycle: Cycle) {
  const latch = createNativeTwoCyclePublicFailureLatchV2();
  const build = new Function('onDepositFundingStage', 'rootPhase', compile(`
    let cycleStep = null; let depositFundingSubstage = null; const callbackTiming = undefined;
    ${mapBody}\n${marks}
    return { markStep, mark: markDepositFundingSubstage, observe: createOwnedHoldFundingStageObserver(markDepositFundingSubstage) };
  `)) as (observe: typeof latch.observe, cycle: Cycle) => {
    markStep: (step: string) => void; mark: Mark; observe: SubstrateFederatedOwnedMiningHoldObserverV1;
  };
  return { ...build(latch.observe, cycle), latch };
}
function runSlice(index: number, mark: Mark, hold: Hold, omitObserver = false): Promise<object> {
  let selected = slices[index]!;
  if (omitObserver) {
    const needle = ', createOwnedHoldFundingStageObserver(markDepositFundingSubstage)';
    assert.equal(selected.split(needle).length, 2);
    selected = selected.replace(needle, '');
  }
  const invoke = new Function('markDepositFundingSubstage', 'holdSubstrateFederatedIsolatedDevnetOwnedMiningTransactionV1',
    'target', 'assertActive', 'readCustody', compile(`${mapBody}
      return (async () => { ${selected}\nreturn heldDepositSnapshot; })();`)) as
    (mark: Mark, hold: Hold, target: object, active: () => void, custody: () => void) => Promise<object>;
  return invoke(mark, hold, Object.freeze({}), () => {}, () => {});
}
function projected(cycle: Cycle, primary: Error, latch: ReturnType<typeof rootSeam>['latch']) {
  tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(primary, cycle);
  tagNativeTwoCycleCycleStepFailureV1(primary, cycle, 'deposit-funding');
  const failure = createNativeTwoCycleWorkerFailureDiagnosticV1(bindings, 'root-or-cleanup', primary);
  const rootPhase = createNativeTwoCycleWorkerRootPhaseV2(bindings,
    { primaryPhase: cycle, cleanupErrorCount: 0, ergoNodeStartupPhase: null });
  const step = createNativeTwoCycleWorkerCycleStepV1(bindings, text(failure), text(rootPhase),
    { cycle, step: 'deposit-funding' });
  const lineage = { workerFailureText: text(failure), workerRootPhaseV2Text: text(rootPhase), workerCycleStepText: text(step) };
  const worker = selectNativeDepositFundingWorkerStageV2(primary, 'root-or-cleanup', latch.selected(), bindings, lineage);
  assert(worker !== null);
  const parentStep = createNativeTwoCycleParentCycleStepV1(bindings, failureDigest,
    lineage.workerFailureText, lineage.workerRootPhaseV2Text, lineage.workerCycleStepText);
  const parentLineage = { ...lineage, parentCycleStepText: text(parentStep), workerDepositFundingStageV2Text: text(worker) };
  const parent = createNativeDepositFundingParentStageV2(bindings, failureDigest, parentLineage);
  expect(parseNativeDepositFundingParentStageV2(Buffer.from(text(parent)), bindings, failureDigest, parentLineage))
    .toEqual(parent);
  return parent;
}

describe('both Root Hold branches to existing V2 public diagnostics', () => {
  for (const [index, cycle] of (['cycle-1', 'cycle-2'] as const).entries()) {
    it.each(boundaries)(`${cycle} projects %s through the actual Root map and worker/Parent lineage`, async boundary => {
      const seam = rootSeam(cycle); seam.markStep('deposit-funding');
      const original = new Error('synthetic private cause must remain private');
      await expect(runSlice(index, seam.mark, async (_target, observe) => {
        assert(observe); expect(observe(boundary)).toBeUndefined(); throw original;
      })).rejects.toBe(original);
      const parent = projected(cycle, original, seam.latch);
      const expected = 'owned-transaction-hold-' + boundary.replace(/^hold-/u, '');
      expect(parent.lastEnteredStage).toBe(expected);
      expect(parent).toMatchObject({ cycle, status: 'last_entered_stage_observed',
        operationCompletionEstablished: false, rootCleanupEstablished: false,
        rawCausePublished: false, stageCauseEstablished: false, campaignAdmitted: false });
      expect(text(parent)).not.toContain(original.message);
    });

    it(`${cycle} advances to the unchanged post-Hold guard and clears on leaving deposit funding`, async () => {
      const seam = rootSeam(cycle); seam.markStep('deposit-funding');
      const snapshot = Object.freeze({});
      expect(await runSlice(index, seam.mark, async (_target, observe) => {
        observe?.('post-hold-active'); return snapshot;
      })).toBe(snapshot);
      expect(seam.latch.selected()).toEqual({ cycle, lastEnteredStage: 'post-hold-owner-custody-guard' });
      seam.markStep('deposit-construction'); expect(seam.latch.selected()).toBeNull();
    });

    it(`${cycle} kills removal of the actual call site's observer`, async () => {
      const seam = rootSeam(cycle); seam.markStep('deposit-funding');
      const original = new Error('synthetic refusal');
      await expect(runSlice(index, seam.mark, async (_target, observe) => {
        observe?.('hold-wire-parse'); throw original;
      }, true)).rejects.toBe(original);
      expect(() => expect(projected(cycle, original, seam.latch).lastEnteredStage)
        .toBe('owned-transaction-hold-wire-parse')).toThrow();
      expect(seam.latch.selected()?.lastEnteredStage).toBe('owned-transaction-hold');
    });
  }

  it('maps exactly the added vocabulary and does not retain a different cycle or invalid stage', () => {
    const first = rootSeam('cycle-1'); first.markStep('deposit-funding');
    const values = boundaries.map(boundary => {
      first.observe(boundary); return first.latch.selected()!.lastEnteredStage;
    });
    expect(new Set(values).size).toBe(boundaries.length);
    expect([...values].sort()).toEqual(NATIVE_DEPOSIT_FUNDING_SUBSTAGES_V1
      .filter(stage => !(legacyStages as readonly string[]).includes(stage)).sort());
    first.latch.observe('cycle-2', 'owned-transaction-hold-request');
    expect(first.latch.selected()).toEqual({ cycle: 'cycle-2', lastEnteredStage: 'owned-transaction-hold-request' });
    first.latch.observe('cycle-2', 'unknown' as never); expect(first.latch.selected()).toBeNull();
  });
});

describe('explicit additive vocabulary compatibility', () => {
  const oldGate = new Function('types', 'OBSERVATION_KEYS', 'NATIVE_DEPOSIT_FUNDING_SUBSTAGES_V1', compile(
    ['fail', 'exactOwnData', 'observation'].map(name => declaration(codec, name).getText(codec)).join('\n')
    + '\nreturn observation;'))(types, ['cycle', 'lastEnteredStage'], legacyStages) as (value: unknown) => unknown;

  it.each(legacyStages)('preserves the previous canonical bytes for %s', lastEnteredStage => {
    const observation = { cycle: 'cycle-1' as const, lastEnteredStage };
    expect(oldGate(observation)).toEqual(observation);
    const legacyBody = { schema: 'e2s.substrate-federated-native-two-cycle-deposit-funding-stage.v2',
      version: 2, status: 'last_entered_stage_observed', ...bindings,
      failureReceiptDigestHex: failureDigest, ...observation, step: 'deposit-funding',
      operationCompletionEstablished: false, rootCleanupEstablished: false,
      rawCausePublished: false, stageCauseEstablished: false, campaignAdmitted: false };
    const legacyBytes = Buffer.from(text({ ...legacyBody, receiptDigestHex: sha256CanonicalJson(legacyBody,
      'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_DEPOSIT_FUNDING_STAGE_V2') }));
    expect(Buffer.from(encodeNativeDepositFundingStageV2(bindings, failureDigest, observation))).toEqual(legacyBytes);
    expect(parseNativeDepositFundingStageV2(legacyBytes, bindings, failureDigest, observation).lastEnteredStage)
      .toBe(lastEnteredStage);
  });

  it('rejects an added stage under the previous vocabulary and rejects unknown or cross-commit data now', () => {
    const observation = { cycle: 'cycle-1' as const, lastEnteredStage: 'owned-transaction-hold-request' as const };
    expect(() => oldGate(observation)).toThrow();
    const bytes = encodeNativeDepositFundingStageV2(bindings, failureDigest, observation);
    expect(() => parseNativeDepositFundingStageV2(bytes, { ...bindings, expectedBridgeCommit: 'e'.repeat(40) },
      failureDigest, observation)).toThrow();
    expect(() => encodeNativeDepositFundingStageV2(bindings, failureDigest,
      { ...observation, lastEnteredStage: 'unknown' as never })).toThrow();
  });
});
