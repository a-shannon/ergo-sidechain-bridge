import { describe, expect, it, vi } from 'vitest';
import { canonicalJson, sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import { beginNativeTwoCycleCallbackTimingV1, tagNativeTwoCycleCallbackTimingFailureV1,
  projectNativeTwoCycleCallbackTimingFailureV1, createNativeTwoCycleWorkerCallbackTimingV1,
  parseNativeTwoCycleWorkerCallbackTimingV1, createNativeTwoCycleParentCallbackTimingV1,
  parseNativeTwoCycleParentCallbackTimingV1 }
  from './substrate-federated-native-two-cycle-callback-timing-v1.js';
import { tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2 }
  from './substrate-federated-native-two-cycle-root-phase-v2.js';
import { tagNativeTwoCycleCycleStepFailureV1 }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';
import { tagIsolatedErgoNodePostCallbackStageV1, tagIsolatedErgoNodeCompletionFailureReasonV1 }
  from './substrate-federated-isolated-devnet-ergo-node-post-callback-stage-v1.js';
import { createNativeTwoCycleWorkerFailureDiagnosticV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { createNativeTwoCycleWorkerRootPhaseV2 }
  from './substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';
import { createNativeTwoCycleWorkerCycleStepV1 }
  from './substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { createNativeTwoCycleWorkerOwnerStageV1, createNativeTwoCycleWorkerOwnerStageV2,
  createNativeTwoCycleParentOwnerStageV1, createNativeTwoCycleParentOwnerStageV2 }
  from './substrate-federated-native-two-cycle-owner-stage-diagnostic-v1.js';

const text = (value: unknown) => `${canonicalJson(value)}\n`;
const bindings = { configSha256Hex: 'a'.repeat(64), expectedBridgeCommit: 'b'.repeat(40),
  pathIdentityDigestHex: 'c'.repeat(64) };
const terminal = 'd'.repeat(64);
const workerDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_CALLBACK_TIMING_V1';
const parentDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_CALLBACK_TIMING_V1';
function trace() {
  let now = 999_999;
  const recorder = beginNativeTwoCycleCallbackTimingV1(() => now);
  now += 399; recorder.record('target-entry');
  now += 200; recorder.record('issuance-output-observation');
  now += 100; recorder.record('issuance-output-observation');
  now += 1; recorder.record('cycle-summary');
  return recorder.finish()!;
}
function eligible(error: Error = new Error('private cause')) {
  tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(error, 'cycle-1');
  tagNativeTwoCycleCycleStepFailureV1(error, 'cycle-1', 'cycle-summary');
  tagIsolatedErgoNodePostCallbackStageV1(error, 'completion-check');
  tagIsolatedErgoNodeCompletionFailureReasonV1(error, 'budget-exceeded');
  return error;
}
function fixture(cleanupErrorCount = 0, reason: 'budget-exceeded' | 'invalid-timing' = 'budget-exceeded') {
  const workerFailureText = text(createNativeTwoCycleWorkerFailureDiagnosticV1(bindings,
    'root-or-cleanup', new Error('private cause')));
  const workerRootPhaseV2Text = text(createNativeTwoCycleWorkerRootPhaseV2(bindings,
    { primaryPhase: 'cycle-1', cleanupErrorCount, ergoNodeStartupPhase: null }));
  const workerCycleStepText = text(createNativeTwoCycleWorkerCycleStepV1(bindings,
    workerFailureText, workerRootPhaseV2Text, { cycle: 'cycle-1', step: 'cycle-summary' }));
  const workerOwnerStageText = text(createNativeTwoCycleWorkerOwnerStageV1(bindings,
    workerFailureText, workerRootPhaseV2Text, workerCycleStepText, 'completion-check'));
  const workerOwnerStageV2Text = text(createNativeTwoCycleWorkerOwnerStageV2(bindings,
    workerFailureText, workerRootPhaseV2Text, workerCycleStepText, workerOwnerStageText, reason));
  const ancestors = { workerFailureText, workerRootPhaseV2Text, workerCycleStepText,
    workerOwnerStageText, workerOwnerStageV2Text };
  const parentV1 = text(createNativeTwoCycleParentOwnerStageV1(bindings, terminal,
    workerFailureText, workerRootPhaseV2Text, workerCycleStepText, workerOwnerStageText));
  const parentV2 = text(createNativeTwoCycleParentOwnerStageV2(bindings, terminal,
    workerFailureText, workerRootPhaseV2Text, workerCycleStepText, workerOwnerStageText,
    workerOwnerStageV2Text, parentV1));
  return { ancestors, parentV1, parentV2 };
}
function receipts() {
  const f = fixture();
  const worker = createNativeTwoCycleWorkerCallbackTimingV1(bindings, f.ancestors, trace());
  const parent = createNativeTwoCycleParentCallbackTimingV1(bindings, terminal, f.ancestors,
    text(worker), f.parentV1, f.parentV2);
  return { ...f, worker, parent };
}
function resign(value: Record<string, unknown>, domain: string) {
  const { receiptDigestHex: ignored, ...body } = value; void ignored;
  return { ...body, receiptDigestHex: sha256CanonicalJson(body, domain) };
}

describe('callback interior monotonic diagnostic', () => {
  it('quantizes only relative boundaries, preserves repeats and freezes the trace', () => {
    const result = trace();
    expect(result.totalDurationMs).toBe(700);
    expect(result.segments).toEqual([
      { step: 'pre-native-target', durationMs: 300 }, { step: 'target-entry', durationMs: 200 },
      { step: 'issuance-output-observation', durationMs: 100 },
      { step: 'issuance-output-observation', durationMs: 100 }, { step: 'cycle-summary', durationMs: 0 },
    ]);
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.segments)).toBe(true);
    expect(result.segments.every(Object.isFrozen)).toBe(true);
    expect(text(result)).not.toContain('999999');
  });
  it.each([NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1])('omits invalid initial clock %s', now => {
    const recorder = beginNativeTwoCycleCallbackTimingV1(() => now);
    recorder.record('cycle-summary'); expect(recorder.finish()).toBeNull();
  });
  it.each(['begin', 'record', 'finish'] as const)('never throws when the clock fails at %s', stage => {
    let calls = 0;
    const recorder = beginNativeTwoCycleCallbackTimingV1(() => {
      if (++calls === ({ begin: 1, record: 2, finish: 3 })[stage]) throw new Error('private clock');
      return calls * 100;
    });
    expect(() => recorder.record('cycle-summary')).not.toThrow();
    expect(recorder.finish()).toBeNull();
  });
  it.each(['regression', 'masked regression', 'overflow', 'unsafe', 'nonfinite', 'unknown label',
    'segment bound', 'no summary', 'repeated initial', 'early summary'] as const)('omits %s', fault => {
    let now = 1_000;
    const recorder = beginNativeTwoCycleCallbackTimingV1(() => now);
    if (fault === 'masked regression') { now += 50; recorder.record('target-entry'); now -= 1; }
    if (fault === 'regression') now -= 1;
    if (fault === 'overflow') now += 86_400_001;
    if (fault === 'unsafe') now = Number.MAX_SAFE_INTEGER + 1;
    if (fault === 'nonfinite') now = Infinity;
    if (fault === 'segment bound') for (let index = 0; index < 64; index++) recorder.record('target-entry');
    if (fault === 'repeated initial') recorder.record('pre-native-target');
    if (fault === 'early summary') { recorder.record('cycle-summary'); recorder.record('target-entry'); }
    recorder.record(fault === 'unknown label' ? 'unknown' as never
      : fault === 'no summary' ? 'target-entry' : 'cycle-summary');
    expect(recorder.finish()).toBeNull();
  });
  it('does not reuse a finished recorder or tag the same error twice', () => {
    const recorder = beginNativeTwoCycleCallbackTimingV1(() => 1);
    recorder.record('cycle-summary'); const result = recorder.finish()!;
    recorder.record('target-entry'); expect(recorder.finish()).toBeNull();
    const error = eligible(); expect(tagNativeTwoCycleCallbackTimingFailureV1(error, result)).toBe(error);
    expect(projectNativeTwoCycleCallbackTimingFailureV1(error)).toBe(result);
    expect(tagNativeTwoCycleCallbackTimingFailureV1(error, result)).toBe(error);
    expect(projectNativeTwoCycleCallbackTimingFailureV1(error)).toBeNull();
  });
  it.each(['unsealed', 'null', 'root phase', 'cycle step', 'owner stage', 'reason', 'missing tags',
    'aggregate', 'cleanup ancestor', 'cause', 'proxy', 'nonerror'] as const)('omits metadata %s', fault => {
    const error = fault === 'missing tags' ? new Error('private')
      : eligible(fault === 'root phase'
        ? tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(new Error('private'), 'cycle-2')
        : new Error('private'));
    if (fault === 'cycle step') tagNativeTwoCycleCycleStepFailureV1(error, 'cycle-1', 'tracker-check');
    if (fault === 'owner stage') tagIsolatedErgoNodePostCallbackStageV1(error, 'mining-shutdown');
    if (fault === 'reason') tagIsolatedErgoNodeCompletionFailureReasonV1(error, 'invalid-timing');
    const trap = vi.fn(() => { throw new Error('getter'); });
    const candidate = fault === 'aggregate' ? new AggregateError([error, error], 'ambiguous')
      : fault === 'cleanup ancestor' ? new AggregateError([error, new Error('cleanup')], 'cleanup')
        : fault === 'cause' ? new Error('outer', { cause: error })
          : fault === 'proxy' ? new Proxy(error, { getPrototypeOf: trap })
            : fault === 'nonerror' ? {} : error;
    const result = trace();
    expect(tagNativeTwoCycleCallbackTimingFailureV1(candidate,
      fault === 'null' ? null : fault === 'unsealed' ? { ...result } : result)).toBe(candidate);
    expect(projectNativeTwoCycleCallbackTimingFailureV1(candidate)).toBeNull();
    expect(trap).not.toHaveBeenCalled();
  });
});

describe('callback timing exact failure lineage', () => {
  it('roundtrips worker and parent against exact owner V2 ancestors with false claims', () => {
    const f = receipts();
    expect(parseNativeTwoCycleWorkerCallbackTimingV1(text(f.worker), bindings, f.ancestors)).toEqual(f.worker);
    expect(parseNativeTwoCycleParentCallbackTimingV1(text(f.parent), bindings, terminal, f.ancestors,
      text(f.worker), f.parentV1, f.parentV2)).toEqual(f.parent);
    expect(f.parent).toMatchObject({ operationCompletionEstablished: false, rootCleanupEstablished: false,
      rawCausePublished: false, performanceCauseEstablished: false });
    expect(text(f.parent)).not.toMatch(/private|999999|epoch|[A-Za-z]:[\\/]/u);
  });
  for (const surface of ['worker', 'parent'] as const) {
    const sample = receipts()[surface];
    it.each(Object.keys(sample))(`rejects ${surface} changed %s after rehash`, field => {
      const f = receipts(); const receipt = f[surface];
      const changed = { ...receipt, [field]: field === 'trace' ? { ...receipt.trace, totalDurationMs: 999 }
        : field === 'version' ? 2 : field.endsWith('Established') || field === 'rawCausePublished' ? true
          : field === 'expectedBridgeCommit' ? 'e'.repeat(40) : field.endsWith('Hex') ? 'e'.repeat(64) : 'foreign' };
      const candidate = text(field === 'receiptDigestHex' ? changed : resign(changed,
        surface === 'worker' ? workerDomain : parentDomain));
      expect(() => surface === 'worker' ? parseNativeTwoCycleWorkerCallbackTimingV1(candidate, bindings, f.ancestors)
        : parseNativeTwoCycleParentCallbackTimingV1(candidate, bindings, terminal, f.ancestors,
          text(f.worker), f.parentV1, f.parentV2)).toThrow();
    });
    it.each(['extra', 'missing', 'duplicate', 'escaped duplicate', 'whitespace', 'newline', 'CRLF',
      'invalid', 'nonobject', 'array', 'byte bound', 'wrong domain'] as const)(
      `rejects ${surface} %s text`, fault => {
        const f = receipts(); const receipt = f[surface];
        const { version: ignored, ...missing } = receipt; void ignored;
        const candidate = fault === 'extra' ? text(resign({ ...receipt, extra: 0 }, workerDomain))
          : fault === 'missing' ? text(resign(missing, workerDomain))
            : fault === 'duplicate' ? text(receipt).replace('"version":1', '"version":1,"version":1')
              : fault === 'escaped duplicate' ? text(receipt).replace('"version":1', '"version":1,"\\u0076ersion":1')
                : fault === 'whitespace' ? ` ${text(receipt)}` : fault === 'newline' ? canonicalJson(receipt)
                  : fault === 'CRLF' ? `${canonicalJson(receipt)}\r\n` : fault === 'invalid' ? '{\n'
                    : fault === 'nonobject' ? 'null\n' : fault === 'array' ? '[]\n'
                      : fault === 'byte bound' ? text({ ...receipt, extra: 'é'.repeat(16 * 1024) })
                        : text(resign({ ...receipt }, `${workerDomain}_WRONG`));
        expect(() => surface === 'worker' ? parseNativeTwoCycleWorkerCallbackTimingV1(candidate, bindings, f.ancestors)
          : parseNativeTwoCycleParentCallbackTimingV1(candidate, bindings, terminal, f.ancestors,
            text(f.worker), f.parentV1, f.parentV2)).toThrow();
      });
  }
  it.each(['scope', 'unit', 'quantizationMs', 'sum', 'unsafe', 'negative', 'fractional', 'negative zero',
    'quantization', 'unknown', 'first', 'last', 'too many', 'too few', 'extra segment', 'extra trace',
    'duration bound'] as const)('rejects trace %s independently', fault => {
    const f = fixture(); const original = trace();
    const segments = original.segments.map(segment => ({ ...segment }));
    const changed: Record<string, unknown> = { ...original, segments };
    if (fault === 'scope' || fault === 'unit') changed[fault] = 'foreign';
    if (fault === 'quantizationMs') changed.quantizationMs = 1;
    if (fault === 'sum') changed.totalDurationMs = 800;
    if (fault === 'unsafe') segments[0]!.durationMs = Number.MAX_SAFE_INTEGER + 1;
    if (fault === 'negative') segments[0]!.durationMs = -100;
    if (fault === 'fractional') segments[0]!.durationMs = 100.5;
    if (fault === 'negative zero') segments[0]!.durationMs = -0;
    if (fault === 'quantization') segments[0]!.durationMs = 1;
    if (fault === 'duration bound') segments[0]!.durationMs = 86_400_100;
    if (fault === 'unknown') segments[1]!.step = 'unknown' as never;
    if (fault === 'first') segments[0]!.step = 'target-entry';
    if (fault === 'last') segments.at(-1)!.step = 'target-exit';
    if (fault === 'too many') {
      changed.segments = [{ step: 'pre-native-target', durationMs: 0 },
        ...Array.from({ length: 63 }, () => ({ step: 'target-entry', durationMs: 100 })),
        { step: 'cycle-summary', durationMs: 0 }];
      changed.totalDurationMs = 6300;
    }
    if (fault === 'too few') changed.segments = [];
    if (fault === 'extra segment') changed.segments = [{ ...segments[0], extra: 0 }, ...segments.slice(1)];
    if (fault === 'extra trace') changed.extra = 0;
    expect(() => createNativeTwoCycleWorkerCallbackTimingV1(bindings, f.ancestors, changed)).toThrow();
  });
  it.each(['own map', 'own reduce', 'index accessor', 'inherited index', 'sparse', 'proxy',
    'own iterator', 'hostile prototype'] as const)('rejects hostile segment array %s without callbacks', fault => {
      const f = fixture(); const original = trace();
      const trap = vi.fn(() => [
        { step: 'pre-native-target', durationMs: 0 },
        { step: 'private arbitrary label', durationMs: 100 },
        { step: 'cycle-summary', durationMs: 0 },
      ]);
      const segments: unknown[] = original.segments.map(segment => ({ ...segment }));
      let supplied: unknown = segments;
      if (fault === 'own map') Object.defineProperty(segments, 'map', { value: trap });
      if (fault === 'own reduce') Object.defineProperty(segments, 'reduce', { get: trap });
      if (fault === 'index accessor') Object.defineProperty(segments, '1', { get: trap });
      if (fault === 'inherited index') {
        delete segments[1];
        const prototype = Object.create(Array.prototype);
        Object.defineProperty(prototype, '1', { get: trap });
        Object.setPrototypeOf(segments, prototype);
      }
      if (fault === 'sparse') delete segments[1];
      if (fault === 'proxy') supplied = new Proxy(segments, {
        get: trap, ownKeys: trap as never, getOwnPropertyDescriptor: trap as never, getPrototypeOf: trap,
      });
      if (fault === 'own iterator') Object.defineProperty(segments, Symbol.iterator, { get: trap });
      if (fault === 'hostile prototype') {
        const prototype = Object.create(Array.prototype);
        Object.defineProperty(prototype, 'map', { get: trap });
        Object.setPrototypeOf(segments, prototype);
      }
      expect(() => createNativeTwoCycleWorkerCallbackTimingV1(bindings, f.ancestors,
        { ...original, segments: supplied, totalDurationMs: fault === 'own map' ? 100 : original.totalDurationMs }))
        .toThrow();
      expect(trap).not.toHaveBeenCalled();
    });
  it('accepts exactly 64 own canonical segments and rejects otherwise valid 65', () => {
    const f = fixture(); const original = trace();
    const segments = [{ step: 'pre-native-target', durationMs: 0 },
      ...Array.from({ length: 62 }, () => ({ step: 'target-entry', durationMs: 100 })),
      { step: 'cycle-summary', durationMs: 0 }];
    const valid = { ...original, segments, totalDurationMs: 6200 };
    const worker = createNativeTwoCycleWorkerCallbackTimingV1(bindings, f.ancestors, valid);
    expect(worker.trace.segments).toHaveLength(64);
    expect(worker.trace.segments.every(Object.isFrozen)).toBe(true);
    expect(parseNativeTwoCycleWorkerCallbackTimingV1(text(worker), bindings, f.ancestors)).toEqual(worker);
    segments.splice(1, 0, { step: 'target-entry', durationMs: 100 });
    expect(() => createNativeTwoCycleWorkerCallbackTimingV1(bindings, f.ancestors,
      { ...valid, totalDurationMs: 6300 })).toThrow();
  });
  it.each(['workerFailureText', 'workerRootPhaseV2Text', 'workerCycleStepText', 'workerOwnerStageText',
    'workerOwnerStageV2Text'] as const)('rejects missing or stale %s', field => {
    const f = receipts();
    expect(() => parseNativeTwoCycleWorkerCallbackTimingV1(text(f.worker), bindings,
      { ...f.ancestors, [field]: '{}' })).toThrow();
    expect(() => parseNativeTwoCycleWorkerCallbackTimingV1(text(f.worker), bindings,
      { ...f.ancestors, [field]: f.ancestors[field].replace('a'.repeat(64), 'e'.repeat(64)) })).toThrow();
  });
  it.each(['cleanup', 'reason', 'parent V1', 'parent V2', 'terminal', 'worker detail'] as const)(
    'rejects unsupported or conflicting %s ancestry', fault => {
      if (fault === 'cleanup' || fault === 'reason') {
        const f = fixture(fault === 'cleanup' ? 1 : 0, fault === 'reason' ? 'invalid-timing' : 'budget-exceeded');
        expect(() => createNativeTwoCycleWorkerCallbackTimingV1(bindings, f.ancestors, trace())).toThrow(); return;
      }
      const f = receipts();
      expect(() => createNativeTwoCycleParentCallbackTimingV1(bindings,
        fault === 'terminal' ? 'e'.repeat(64) : terminal, f.ancestors,
        fault === 'worker detail' ? '{}' : text(f.worker),
        fault === 'parent V1' ? '{}' : f.parentV1, fault === 'parent V2' ? '{}' : f.parentV2)).toThrow();
    });
});
