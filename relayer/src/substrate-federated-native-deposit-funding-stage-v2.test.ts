import { describe, expect, it } from 'vitest';

import { canonicalJson, sha256CanonicalJson }
  from './ergo-settlement-core/strict-json.js';
import { createNativeTwoCycleWorkerFailureDiagnosticV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { createNativeTwoCycleWorkerRootPhaseV2 }
  from './substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';
import { createNativeTwoCycleWorkerCycleStepV1 }
  from './substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { createNativeTwoCycleParentCycleStepV1 }
  from './substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 }
  from './substrate-federated-native-two-cycle-root-phase-v1.js';
import { tagNativeTwoCycleCycleStepFailureV1 }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';
import {
  createNativeDepositFundingStageV2, encodeNativeDepositFundingStageV2,
  parseNativeDepositFundingStageV2, createNativeDepositFundingWorkerStageV2,
  parseNativeDepositFundingWorkerStageV2, NATIVE_DEPOSIT_FUNDING_STAGE_V2_DOMAIN,
  NATIVE_DEPOSIT_FUNDING_WORKER_STAGE_V2_DOMAIN,
  createNativeDepositFundingParentStageV2, parseNativeDepositFundingParentStageV2,
  NATIVE_DEPOSIT_FUNDING_PARENT_STAGE_V2_DOMAIN,
  selectNativeDepositFundingWorkerStageV2,
  type NativeDepositFundingStageObservationV2,
} from './substrate-federated-native-deposit-funding-stage-v2.js';

const bindings = Object.freeze({ configSha256Hex: 'a'.repeat(64),
  expectedBridgeCommit: 'b'.repeat(40), pathIdentityDigestHex: 'c'.repeat(64) });
const failureDigest = 'd'.repeat(64);
const observed: NativeDepositFundingStageObservationV2 = Object.freeze({
  cycle: 'cycle-1', lastEnteredStage: 'owned-reward-input-discovery',
});
const text = (value: unknown): string => canonicalJson(value) + '\n';

function workerLineage(cycle: 'cycle-1' | 'cycle-2' = 'cycle-1',
  stepName: 'deposit-funding' | 'deposit-construction' = 'deposit-funding') {
  const failure = createNativeTwoCycleWorkerFailureDiagnosticV1(bindings,
    'root-or-cleanup', new Error('opaque synthetic cause'));
  const root = createNativeTwoCycleWorkerRootPhaseV2(bindings,
    { primaryPhase: cycle, cleanupErrorCount: 0, ergoNodeStartupPhase: null });
  const step = createNativeTwoCycleWorkerCycleStepV1(bindings,
    text(failure), text(root), { cycle, step: stepName });
  return { workerFailureText: text(failure), workerRootPhaseV2Text: text(root),
    workerCycleStepText: text(step) };
}

function parentLineage(cycle: 'cycle-1' | 'cycle-2' = 'cycle-1') {
  const worker = workerLineage(cycle);
  const parentStep = createNativeTwoCycleParentCycleStepV1(bindings,
    failureDigest, worker.workerFailureText, worker.workerRootPhaseV2Text,
    worker.workerCycleStepText);
  const stage = createNativeDepositFundingWorkerStageV2(bindings, worker,
    { cycle, lastEnteredStage: observed.lastEnteredStage });
  return { ...worker, parentCycleStepText: text(parentStep),
    workerDepositFundingStageV2Text: text(stage) };
}

function resign(value: Record<string, unknown>): Uint8Array {
  const { receiptDigestHex: ignored, ...body } = value;
  void ignored;
  return Buffer.from(canonicalJson({ ...body, receiptDigestHex:
    sha256CanonicalJson(body, NATIVE_DEPOSIT_FUNDING_STAGE_V2_DOMAIN) }) + '\n');
}

describe('V2 prospective deposit funding stage companion', () => {
  it('binds one finite stage to selected public failure lineage with only false authority', () => {
    const bytes = encodeNativeDepositFundingStageV2(bindings, failureDigest, observed);
    expect(bytes.length).toBeLessThanOrEqual(16 * 1024);
    const parsed = parseNativeDepositFundingStageV2(bytes, bindings, failureDigest, observed);
    expect(parsed).toEqual(createNativeDepositFundingStageV2(bindings, failureDigest, observed));
    expect(parsed).toMatchObject({
      status: 'last_entered_stage_observed', cycle: 'cycle-1', step: 'deposit-funding',
      lastEnteredStage: 'owned-reward-input-discovery',
      operationCompletionEstablished: false, rootCleanupEstablished: false,
      rawCausePublished: false, stageCauseEstablished: false, campaignAdmitted: false,
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.keys(parsed).sort()).toEqual([
      'schema', 'version', 'status', 'configSha256Hex', 'expectedBridgeCommit',
      'pathIdentityDigestHex', 'failureReceiptDigestHex', 'cycle', 'step',
      'lastEnteredStage', 'operationCompletionEstablished', 'rootCleanupEstablished',
      'rawCausePublished', 'stageCauseEstablished', 'campaignAdmitted', 'receiptDigestHex',
    ].sort());
  });

  it('rejects a resigned alternative stage and a changed V1 failure or config identity', () => {
    const record = createNativeDepositFundingStageV2(bindings, failureDigest, observed);
    const selected = (bytes: Uint8Array) =>
      parseNativeDepositFundingStageV2(bytes, bindings, failureDigest, observed);
    expect(() => selected(resign({ ...record,
      lastEnteredStage: 'held-funding-equality' }))).toThrow(/identity or canonical bytes/u);
    expect(() => selected(resign({ ...record,
      failureReceiptDigestHex: 'e'.repeat(64) }))).toThrow(/identity or canonical bytes/u);
    expect(() => selected(resign({ ...record,
      configSha256Hex: 'f'.repeat(64) }))).toThrow(/identity or canonical bytes/u);
    expect(() => selected(resign({ ...record,
      stageCauseEstablished: true }))).toThrow(/identity or canonical bytes/u);
    expect(() => selected(resign({ ...record,
      extra: true }))).toThrow(/identity or canonical bytes/u);
    expect(() => selected(resign({ ...record,
      lastEnteredStage: 'invented-stage' }))).toThrow(/identity or canonical bytes/u);
  });

  it('rejects duplicate keys, invalid UTF-8, a BOM and noncanonical framing', () => {
    const record = createNativeDepositFundingStageV2(bindings, failureDigest, observed);
    const selected = (bytes: Uint8Array) =>
      parseNativeDepositFundingStageV2(bytes, bindings, failureDigest, observed);
    const canonical = canonicalJson(record) + '\n';
    expect(() => selected(Buffer.from(canonical.replace('"schema":',
      '"schema":"duplicate","schema":')))).toThrow(/identity or canonical bytes/u);
    expect(() => selected(Buffer.from([0xff]))).toThrow(/identity or canonical bytes/u);
    expect(() => selected(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(canonical)]))).toThrow(/identity or canonical bytes/u);
    expect(() => selected(Buffer.from(canonical.replaceAll('\n', '\r\n'))))
      .toThrow(/identity or canonical bytes/u);
  });
});

describe('V2 worker-only deposit funding stage companion', () => {
  it.each(['cycle-1', 'cycle-2'] as const)(
    'selects a validated %s ordinary own-tagged deposit failure', cycle => {
      const primary = tagNativeTwoCycleCycleStepFailureV1(
        tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(
          new Error('opaque synthetic cause'), cycle), cycle, 'deposit-funding');
      const selectedObservation = { cycle,
        lastEnteredStage: 'owned-reward-input-discovery' as const };
      const lineage = workerLineage(cycle);
      const selected = selectNativeDepositFundingWorkerStageV2(
        primary, 'root-or-cleanup', selectedObservation, bindings, lineage);
      expect(selected).toEqual(createNativeDepositFundingWorkerStageV2(
        bindings, lineage, selectedObservation));
      expect(canonicalJson(selected)).not.toContain('opaque synthetic cause');
    });

  it('returns no worker companion for primitive, proxy, aggregate, stale or incomplete inputs', () => {
    const primary = tagNativeTwoCycleCycleStepFailureV1(
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(
        new Error('opaque synthetic cause'), 'cycle-1'), 'cycle-1', 'deposit-funding');
    const lineage = workerLineage();
    const choose = (failure: unknown, stage: 'root-or-cleanup' | 'pre-root' = 'root-or-cleanup',
      latch: NativeDepositFundingStageObservationV2 | null = observed,
      selectedLineage = lineage) => selectNativeDepositFundingWorkerStageV2(
      failure, stage, latch, bindings, selectedLineage);
    expect(choose('primitive')).toBeNull();
    expect(choose(new Proxy(new Error('proxy'), {}))).toBeNull();
    expect(choose(new AggregateError([primary], 'aggregate'))).toBeNull();
    expect(choose(primary, 'pre-root')).toBeNull();
    expect(choose(primary, 'root-or-cleanup', null)).toBeNull();
    expect(choose(primary, 'root-or-cleanup', { ...observed, cycle: 'cycle-2' }))
      .toBeNull();
    expect(choose(primary, 'root-or-cleanup', {
      ...observed, lastEnteredStage: 'forged' as never })).toBeNull();
    expect(choose(primary, 'root-or-cleanup', observed,
      { ...lineage, workerCycleStepText: '' })).toBeNull();
    expect(choose(new Error('untagged'))).toBeNull();
  });

  it('binds only the selected V1 worker failure, root and cycle-step receipts', () => {
    const lineage = workerLineage();
    const worker = createNativeDepositFundingWorkerStageV2(bindings, lineage, observed);
    const bytes = Buffer.from(text(worker));
    expect(bytes.length).toBeLessThanOrEqual(16 * 1024);
    expect(parseNativeDepositFundingWorkerStageV2(bytes, bindings, lineage, observed))
      .toEqual(worker);
    expect(worker).toMatchObject({
      status: 'last_entered_stage_observed', cycle: 'cycle-1', step: 'deposit-funding',
      lastEnteredStage: 'owned-reward-input-discovery',
      operationCompletionEstablished: false, rootCleanupEstablished: false,
      rawCausePublished: false, stageCauseEstablished: false, campaignAdmitted: false,
    });
    expect(Object.isFrozen(worker)).toBe(true);
  });

  it('rejects stale cycle, non-funding step and resigned wrong stage or V1 lineage', () => {
    const lineage = workerLineage();
    const worker = createNativeDepositFundingWorkerStageV2(bindings, lineage, observed);
    const parse = (value: unknown) => parseNativeDepositFundingWorkerStageV2(
      Buffer.from(text(value)), bindings, lineage, observed);
    expect(() => createNativeDepositFundingWorkerStageV2(bindings,
      workerLineage('cycle-2'), observed)).toThrow();
    expect(() => createNativeDepositFundingWorkerStageV2(bindings,
      workerLineage('cycle-1', 'deposit-construction'), observed)).toThrow();
    const resigned = (changes: Record<string, unknown>) => {
      const { receiptDigestHex: ignored, ...body } = { ...worker, ...changes };
      void ignored;
      return { ...body, receiptDigestHex: sha256CanonicalJson(body,
        NATIVE_DEPOSIT_FUNDING_WORKER_STAGE_V2_DOMAIN) };
    };
    expect(() => parse(resigned({ lastEnteredStage: 'held-funding-equality' }))).toThrow();
    expect(() => parse(resigned({ workerFailureReceiptDigestHex: 'e'.repeat(64) }))).toThrow();
    expect(() => parse(resigned({ workerCycleStepReceiptDigestHex: 'f'.repeat(64) }))).toThrow();
    expect(() => parse(resigned({ stageCauseEstablished: true }))).toThrow();
    expect(() => parse(resigned({ extra: true }))).toThrow();
  });

  it('refuses malformed worker bytes before a public lineage claim', () => {
    const lineage = workerLineage();
    const worker = createNativeDepositFundingWorkerStageV2(bindings, lineage, observed);
    const parse = (bytes: Uint8Array) =>
      parseNativeDepositFundingWorkerStageV2(bytes, bindings, lineage, observed);
    const canonical = text(worker);
    expect(() => parse(Buffer.from(canonical.replace('"schema":',
      '"schema":"duplicate","schema":')))).toThrow();
    expect(() => parse(Buffer.from([0xff]))).toThrow();
    expect(() => parse(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(canonical)]))).toThrow();
  });
});

describe('V2 parent deposit funding stage companion', () => {
  it.each(['cycle-1', 'cycle-2'] as const)(
    'joins the immutable V1 terminal and exact %s worker/parent lineage', cycle => {
      const lineage = parentLineage(cycle);
      const parent = createNativeDepositFundingParentStageV2(bindings,
        failureDigest, lineage);
      const bytes = Buffer.from(text(parent));
      expect(bytes.length).toBeLessThanOrEqual(16 * 1024);
      expect(parseNativeDepositFundingParentStageV2(bytes, bindings,
        failureDigest, lineage)).toEqual(parent);
      expect(parent).toMatchObject({
        status: 'last_entered_stage_observed', cycle, step: 'deposit-funding',
        lastEnteredStage: observed.lastEnteredStage,
        operationCompletionEstablished: false, rootCleanupEstablished: false,
        rawCausePublished: false, stageCauseEstablished: false, campaignAdmitted: false,
      });
      expect(Object.isFrozen(parent)).toBe(true);
    });

  it('rejects missing or foreign worker V2 and mismatched parent-step ancestry', () => {
    const lineage = parentLineage();
    expect(() => createNativeDepositFundingParentStageV2(bindings, failureDigest,
      { ...lineage, workerDepositFundingStageV2Text: '' })).toThrow();
    const foreign = parentLineage('cycle-2');
    expect(() => createNativeDepositFundingParentStageV2(bindings, failureDigest,
      { ...lineage, workerDepositFundingStageV2Text:
        foreign.workerDepositFundingStageV2Text })).toThrow();
    expect(() => createNativeDepositFundingParentStageV2(bindings, failureDigest,
      { ...lineage, parentCycleStepText: foreign.parentCycleStepText })).toThrow();
    expect(() => createNativeDepositFundingParentStageV2(bindings,
      'e'.repeat(64), lineage)).toThrow();
  });

  it('rejects resigned digest, extra keys and noncanonical parent bytes', () => {
    const lineage = parentLineage();
    const parent = createNativeDepositFundingParentStageV2(bindings, failureDigest, lineage);
    const parse = (value: Uint8Array) => parseNativeDepositFundingParentStageV2(
      value, bindings, failureDigest, lineage);
    const resigned = (change: Record<string, unknown>) => {
      const { receiptDigestHex: ignored, ...body } = { ...parent, ...change };
      void ignored;
      return Buffer.from(text({ ...body, receiptDigestHex: sha256CanonicalJson(body,
        NATIVE_DEPOSIT_FUNDING_PARENT_STAGE_V2_DOMAIN) }));
    };
    expect(() => parse(resigned({ workerDepositFundingStageV2ReceiptDigestHex:
      'f'.repeat(64) }))).toThrow();
    expect(() => parse(resigned({ stageCauseEstablished: true }))).toThrow();
    expect(() => parse(resigned({ extra: true }))).toThrow();
    expect(() => parse(Buffer.from(text(parent).replace('"schema":',
      '"schema":"duplicate","schema":')))).toThrow();
    expect(() => parse(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(text(parent))]))).toThrow();
  });
});
