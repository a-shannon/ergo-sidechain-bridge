import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import { tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 as rootTag }
  from './substrate-federated-native-two-cycle-root-phase-v1.js';
import { tagNativeTwoCycleCycleStepFailureV1 as stepTag }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';
import { createNativeTwoCycleWorkerFailureDiagnosticV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { createNativeTwoCycleWorkerRootPhaseV2 }
  from './substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';
import { createNativeTwoCycleWorkerCycleStepV1, createNativeTwoCycleParentCycleStepV1 }
  from './substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import {
  tagSubstrateFederatedNativeCommittedReserveFailureStageV1 as stageTag,
  projectSubstrateFederatedNativeCommittedReserveFailureStageV1 as stageProject,
  createNativeTwoCycleWorkerCommittedReserveStageV1 as createLegacyWorker,
  createNativeTwoCycleParentCommittedReserveStageV1 as createLegacyParent,
  SUBSTRATE_FEDERATED_NATIVE_COMMITTED_RESERVE_FAILURE_STAGES_V1 as stages,
  type SubstrateFederatedNativeCommittedReserveFailureStageV1 as Stage,
  type SubstrateFederatedNativeCommittedReserveKindV1 as Kind,
} from './substrate-federated-native-committed-reserve-failure-v1.js';
import {
  NATIVE_COMMITTED_RESERVE_REVALIDATION_ORIGINS_V1 as origins,
  tagNativeCommittedReserveRevalidationOriginV1 as tag,
  projectNativeCommittedReserveRevalidationOriginV1 as project,
  createNativeTwoCycleWorkerCommittedReserveRevalidationV1 as createWorker,
  parseNativeTwoCycleWorkerCommittedReserveRevalidationV1 as parseWorker,
  createNativeTwoCycleParentCommittedReserveRevalidationV1 as createParent,
  parseNativeTwoCycleParentCommittedReserveRevalidationV1 as parseParent,
  type NativeCommittedReserveRevalidationOriginV1 as Origin,
} from './substrate-federated-native-committed-reserve-revalidation-v1.js';

type Cycle = 'cycle-1' | 'cycle-2';
const bindings = { configSha256Hex: 'a'.repeat(64), expectedBridgeCommit: 'b'.repeat(40),
  pathIdentityDigestHex: 'c'.repeat(64) };
const terminal = 'd'.repeat(64);
const workerDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_COMMITTED_RESERVE_REVALIDATION_V1';
const parentDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_COMMITTED_RESERVE_REVALIDATION_V1';
const text = (value: unknown) => `${canonicalJson(value)}\n`;
const resign = (record: Record<string, unknown>, domain: string) => {
  const { receiptDigestHex: ignored, ...body } = record; void ignored;
  return { ...body, receiptDigestHex: sha256CanonicalJson(body, domain) };
};
function primary(origin: Origin = 'revalidator-call', cycle: Cycle = 'cycle-1', kind: Kind = 'continuation') {
  return tag(stepTag(rootTag(stageTag(new Error('opaque'), 'operational-revalidate', kind), cycle),
    cycle, 'committed-reserve'), origin);
}
function fixture(origin: Origin = 'revalidator-call', cycle: Cycle = 'cycle-1', kind: Kind = 'continuation') {
  const failure = createNativeTwoCycleWorkerFailureDiagnosticV1(bindings, 'root-or-cleanup', new Error());
  const root = createNativeTwoCycleWorkerRootPhaseV2(bindings,
    { primaryPhase: cycle, cleanupErrorCount: 0, ergoNodeStartupPhase: null });
  const step = createNativeTwoCycleWorkerCycleStepV1(bindings, text(failure), text(root),
    { cycle, step: 'committed-reserve' });
  const parentStep = createNativeTwoCycleParentCycleStepV1(bindings, terminal,
    text(failure), text(root), text(step));
  const legacyWorker = createLegacyWorker(bindings, text(failure), text(root), text(step),
    'operational-revalidate', kind);
  const legacyParent = createLegacyParent(bindings, terminal, text(failure), text(root), text(step),
    text(legacyWorker), text(parentStep));
  const workerLineage = { workerFailureText: text(failure), workerRootPhaseV2Text: text(root),
    workerCycleStepText: text(step), workerCommittedReserveStageText: text(legacyWorker) };
  const worker = createWorker(bindings, workerLineage, origin);
  const lineage = { ...workerLineage, parentCycleStepText: text(parentStep),
    parentCommittedReserveStageText: text(legacyParent), workerRevalidationText: text(worker) };
  const parent = createParent(bindings, terminal, lineage);
  return { failure, root, step, parentStep, legacyWorker, legacyParent, worker, parent, lineage };
}

describe('invocation-local committed reserve revalidation origin', () => {
  it('has exactly two frozen origins', () => {
    expect(origins).toEqual(['callback-observation-guard', 'revalidator-call']);
    expect(Object.isFrozen(origins)).toBe(true);
  });
  describe.each(['cycle-1', 'cycle-2'] as const)('%s', cycle => {
    describe.each(['genesis', 'continuation'] as const)('%s', kind => {
      it.each(origins)('projects %s on the exact native primary', origin => {
        const error = primary(origin, cycle, kind);
        Object.defineProperties(error, {
          message: { get() { throw new Error('message read'); } },
          stack: { get() { throw new Error('stack read'); } },
          cause: { get() { throw new Error('cause read'); } },
          revalidationOrigin: { get() { throw new Error('property read'); } },
        });
        const keys = Reflect.ownKeys(error);
        expect(tag(error, origin)).toBe(error);
        expect(Reflect.ownKeys(error)).toEqual(keys);
        expect(project(error)).toBe(origin);
        expect(stageProject(error)).toEqual({ committedReserveStage: 'operational-revalidate',
          committedReserveKind: kind });
        expect(project(new AggregateError([error, rootTag(new Error(), 'cleanup')]))).toBe(origin);
      });
    });
  });
  it.each([undefined, null, 1, 'opaque', {}, Object.create(Error.prototype),
    new Proxy(new Error(), {})])('preserves and refuses nonnative error %#', value => {
    expect(tag(value, 'revalidator-call')).toBe(value);
    expect(project(value)).toBeNull();
  });
  it('never consults proxy traps or forged prototypes', () => {
    let traps = 0;
    const handler = { get() { traps++; throw new Error(); },
      getPrototypeOf() { traps++; throw new Error(); },
      getOwnPropertyDescriptor() { traps++; throw new Error(); } };
    const proxy = new Proxy(new Error(), handler);
    expect(tag(proxy, 'revalidator-call')).toBe(proxy);
    expect(project(proxy)).toBeNull();
    const { proxy: revoked, revoke } = Proxy.revocable(new Error(), handler); revoke();
    expect(tag(revoked, 'revalidator-call')).toBe(revoked);
    expect(project(revoked)).toBeNull();
    const error = primary(); Object.setPrototypeOf(error, new Proxy(Error.prototype, handler));
    expect(project(error)).toBeNull();
    expect(traps).toBe(0);
  });
  it.each([Object.freeze, Object.preventExtensions])('tags sealed errors privately %#', seal => {
    const error = primary(); seal(error);
    expect(tag(error, 'revalidator-call')).toBe(error);
    expect(project(error)).toBe('revalidator-call');
  });
  it.each([null, 1, {}, '', 'invalid', 'Revalidator-call', 'callback-observation-guard'])(
    'permanently refuses conflicted origin %#', invalid => {
      const error = primary(); tag(error, invalid as Origin); tag(error, 'revalidator-call');
      expect(project(error)).toBeNull();
      expect(stageProject(error)?.committedReserveStage).toBe('operational-revalidate');
    });
  it.each(stages.filter(stage => stage !== 'operational-revalidate'))(
    'does not convert existing stage %s', stage => {
      const error = tag(stepTag(rootTag(stageTag(new Error(), stage, 'continuation'), 'cycle-1'),
        'cycle-1', 'committed-reserve'), 'revalidator-call');
      expect(project(error)).toBeNull();
      expect(stageProject(error)?.committedReserveStage).toBe(stage);
    });
  it('requires origin and own stage/kind/root/step on the same error', () => {
    for (const missing of ['origin', 'stage', 'kind', 'root', 'step'] as const) {
      const error = new Error();
      if (missing !== 'origin') tag(error, 'revalidator-call');
      if (missing !== 'stage') stageTag(error, 'operational-revalidate',
        missing === 'kind' ? undefined : 'continuation');
      if (missing !== 'root') rootTag(error, 'cycle-1');
      if (missing !== 'step') stepTag(error, 'cycle-1', 'committed-reserve');
      expect(project(error), missing).toBeNull();
    }
  });
  it.each(['ancestor', 'descendant', 'sibling', 'cleanup'] as const)(
    'does not borrow origin from %s', placement => {
      const error = stepTag(rootTag(stageTag(new Error(), 'operational-revalidate', 'continuation'),
        'cycle-1'), 'cycle-1', 'committed-reserve');
      const wrong = tag(new Error(), 'revalidator-call');
      const graph = placement === 'ancestor' ? tag(new AggregateError([error]), 'revalidator-call')
        : placement === 'descendant' ? stepTag(rootTag(stageTag(new AggregateError([wrong]),
          'operational-revalidate', 'continuation'), 'cycle-1'), 'cycle-1', 'committed-reserve')
        : new AggregateError([error, placement === 'cleanup' ? rootTag(wrong, 'cleanup') : wrong]);
      expect(stageProject(graph)?.committedReserveStage).toBe('operational-revalidate');
      expect(project(graph)).toBeNull();
    });
  it('counts repeated primary identity once while checking the whole graph', () => {
    const error = primary();
    expect(project(new AggregateError([error, error]))).toBe('revalidator-call');
    const graph = new AggregateError([error, ...Array.from({ length: 62 }, () => new Error())]);
    expect(project(graph)).toBe('revalidator-call');
    graph.errors.push(new Error()); expect(project(graph)).toBeNull();
  });
  it.each(['two origins', 'two primaries', 'conflicted sibling', 'cleanup origin',
    'cleanup ancestor', 'shared cleanup', 'cycle graph', 'primitive tail', 'sparse', 'getter child',
    'getter errors', 'proxy children', 'iterator', 'array prototype', 'wrong step', 'wrong cycle',
    'conflicted stage', 'conflicted kind'] as const)('fails closed on %s', fault => {
    const error = primary(); const graph = new AggregateError([error]);
    let candidate: unknown = graph;
    if (fault === 'two origins') graph.errors.push(tag(new Error(), 'revalidator-call'));
    if (fault === 'two primaries') graph.errors.push(primary());
    if (fault === 'conflicted sibling') {
      const sibling = tag(new Error(), 'revalidator-call'); tag(sibling, 'callback-observation-guard');
      graph.errors.push(sibling);
    }
    if (fault === 'cleanup origin') graph.errors.push(rootTag(tag(new Error(), 'revalidator-call'), 'cleanup'));
    if (fault === 'cleanup ancestor') candidate = rootTag(graph, 'cleanup');
    if (fault === 'shared cleanup') candidate = new AggregateError([
      graph, rootTag(new AggregateError([graph]), 'cleanup'),
    ]);
    if (fault === 'cycle graph') graph.errors.push(graph);
    if (fault === 'primitive tail') graph.errors.push('opaque');
    if (fault === 'sparse') graph.errors.length = 2;
    if (fault === 'getter child') Object.defineProperty(graph.errors, '0', { get() { throw new Error(); } });
    if (fault === 'getter errors') Object.defineProperty(graph, 'errors', { get() { throw new Error(); } });
    if (fault === 'proxy children') graph.errors = new Proxy([error], { getOwnPropertyDescriptor() {
      throw new Error('proxy consulted');
    } });
    if (fault === 'iterator') graph.errors[Symbol.iterator] = function* () { throw new Error(); };
    if (fault === 'array prototype') Object.setPrototypeOf(graph.errors, null);
    if (fault === 'wrong step') stepTag(error, 'cycle-1', 'tracker-check');
    if (fault === 'wrong cycle') stepTag(error, 'cycle-2', 'committed-reserve');
    if (fault === 'conflicted stage') stageTag(error, 'operational-sign', 'continuation');
    if (fault === 'conflicted kind') stageTag(error, 'operational-revalidate', 'genesis');
    expect(project(candidate)).toBeNull();
  });
  it('does not infer origin from caller properties or an error cause', () => {
    const error = stepTag(rootTag(stageTag(Object.assign(new Error('revalidator-call'),
      { revalidationOrigin: 'revalidator-call', cause: primary() }), 'operational-revalidate',
    'continuation'), 'cycle-1'), 'cycle-1', 'committed-reserve');
    expect(project(error)).toBeNull();
  });
  it('refuses a native aggregate whose Error prototype masks its own errors graph', () => {
    const error = new AggregateError(['hostile tail']);
    Object.setPrototypeOf(error, Error.prototype);
    stageTag(error, 'operational-revalidate', 'continuation');
    rootTag(error, 'cycle-1'); stepTag(error, 'cycle-1', 'committed-reserve');
    expect(tag(error, 'revalidator-call')).toBe(error);
    expect(project(error)).toBeNull();
  });
  describe.each(['masked aggregate', 'ordinary error'] as const)('%s own errors refusal', shape => {
    it.each(['data', 'getter', 'proxy array', 'proxy child'] as const)(
      'refuses %s without executing getters or proxy traps', fault => {
        let consulted = 0;
        const handler = { get() { consulted++; throw new Error('proxy consulted'); },
          getPrototypeOf() { consulted++; throw new Error('proxy consulted'); },
          getOwnPropertyDescriptor() { consulted++; throw new Error('proxy consulted'); } };
        const error = shape === 'masked aggregate' ? new AggregateError([]) : new Error();
        Object.setPrototypeOf(error, Error.prototype);
        if (fault === 'getter') Object.defineProperty(error, 'errors', {
          configurable: true, get() { consulted++; throw new Error('getter consulted'); },
        });
        else Object.defineProperty(error, 'errors', { configurable: true,
          value: fault === 'data' ? [] : fault === 'proxy array' ? new Proxy([], handler)
            : [new Proxy(new Error(), handler)],
        });
        stageTag(error, 'operational-revalidate', 'continuation');
        rootTag(error, 'cycle-1'); stepTag(error, 'cycle-1', 'committed-reserve');
        expect(tag(error, 'revalidator-call')).toBe(error);
        expect(project(error)).toBeNull();
        expect(consulted).toBe(0);
      });
  });
  it('refuses masked own errors on an untagged aggregate child', () => {
    let consulted = 0;
    const masked = new AggregateError([]); Object.setPrototypeOf(masked, Error.prototype);
    Object.defineProperty(masked, 'errors', { get() { consulted++; throw new Error('getter consulted'); } });
    expect(project(new AggregateError([primary(), masked]))).toBeNull();
    expect(consulted).toBe(0);
  });
  it('preserves normal native Error and canonical aggregate projection after shape refusal', () => {
    const error = primary(); const graph = new AggregateError([error, new Error()]);
    expect(tag(error, 'revalidator-call')).toBe(error);
    expect(project(error)).toBe('revalidator-call');
    expect(tag(graph, 'revalidator-call')).toBe(graph);
    // An ancestor origin remains invalid; its exact thrown identity is preserved.
    expect(project(graph)).toBeNull();
    expect(project(new AggregateError([error, new Error()]))).toBe('revalidator-call');
  });
});

const workerFields = ['schema', 'version', 'status', 'configSha256Hex', 'expectedBridgeCommit',
  'pathIdentityDigestHex', 'workerFailureReceiptDigestHex', 'workerRootPhaseV2ReceiptDigestHex',
  'workerCycleStepReceiptDigestHex', 'workerCommittedReserveStageReceiptDigestHex', 'cycle', 'step',
  'committedReserveStage', 'committedReserveKind', 'revalidationOrigin', 'operationCompletionEstablished',
  'rootCleanupEstablished', 'rawCausePublished', 'receiptDigestHex'];
const parentFields = [...workerFields, 'failureReceiptDigestHex', 'parentCycleStepReceiptDigestHex',
  'parentCommittedReserveStageReceiptDigestHex', 'workerRevalidationReceiptDigestHex'];
function replacement(field: string): unknown {
  if (field.endsWith('Established') || field === 'rawCausePublished') return true;
  if (field === 'version') return 2;
  if (field === 'cycle') return 'cycle-2';
  if (field === 'step') return 'source-lock';
  if (field === 'committedReserveStage') return 'operational-sign';
  if (field === 'committedReserveKind') return 'genesis';
  if (field === 'revalidationOrigin') return 'unclassified';
  if (field === 'expectedBridgeCommit') return 'e'.repeat(40);
  return field.endsWith('Hex') ? 'e'.repeat(64) : 'other';
}

describe('committed reserve revalidation canonical diagnostic companions', () => {
  describe.each(['cycle-1', 'cycle-2'] as const)('%s', cycle => {
    describe.each(['genesis', 'continuation'] as const)('%s', kind => {
      it.each(origins)('roundtrips %s with exact legacy lineage and false claims', origin => {
        const f = fixture(origin, cycle, kind);
        expect(parseWorker(text(f.worker), bindings, f.lineage)).toEqual(f.worker);
        expect(parseParent(text(f.parent), bindings, terminal, f.lineage)).toEqual(f.parent);
        expect(f.worker).toMatchObject({ cycle, step: 'committed-reserve',
          committedReserveStage: 'operational-revalidate', committedReserveKind: kind,
          revalidationOrigin: origin, workerCommittedReserveStageReceiptDigestHex: f.legacyWorker.receiptDigestHex,
          operationCompletionEstablished: false, rootCleanupEstablished: false, rawCausePublished: false });
        expect(f.parent).toMatchObject({ parentCommittedReserveStageReceiptDigestHex: f.legacyParent.receiptDigestHex,
          workerRevalidationReceiptDigestHex: f.worker.receiptDigestHex, failureReceiptDigestHex: terminal,
          operationCompletionEstablished: false, rootCleanupEstablished: false, rawCausePublished: false });
        expect(Object.isFrozen(f.worker)).toBe(true); expect(Object.isFrozen(f.parent)).toBe(true);
        expect(text(f.parent)).not.toMatch(/opaque|message|stack|[A-Za-z]:[\\/]/u);
      });
    });
  });
  it.each(workerFields)('rejects individually changed worker %s after rehash', field => {
    const f = fixture(); const candidate = { ...f.worker, [field]: replacement(field) };
    expect(() => parseWorker(text(field === 'receiptDigestHex' ? candidate : resign(candidate, workerDomain)),
      bindings, f.lineage)).toThrow();
  });
  it.each(parentFields)('rejects individually changed parent %s after rehash', field => {
    const f = fixture(); const candidate = { ...f.parent, [field]: replacement(field) };
    expect(() => parseParent(text(field === 'receiptDigestHex' ? candidate : resign(candidate, parentDomain)),
      bindings, terminal, f.lineage)).toThrow();
  });
  describe.each(['worker', 'parent'] as const)('%s exact bounded canonical JSON', surface => {
    it.each(['extra', 'missing', 'duplicate', 'escaped duplicate', 'whitespace', 'no LF', 'CRLF',
      'two LF', 'invalid', 'null', 'array', 'over bound', 'wrong domain', 'old stage domain',
      'old cycle domain', 'unseparated domain'] as const)('refuses %s', fault => {
      const f = fixture(); const record = surface === 'worker' ? f.worker : f.parent;
      const domain = surface === 'worker' ? workerDomain : parentDomain;
      let candidate = text(record);
      if (fault === 'extra') candidate = text(resign({ ...record, rawCause: 'opaque' }, domain));
      if (fault === 'missing') {
        const { status: ignored, ...missing } = record; void ignored; candidate = text(resign(missing, domain));
      }
      if (fault === 'duplicate') candidate = candidate.replace('{', '{"version":1,');
      if (fault === 'escaped duplicate') candidate = candidate.replace('{', '{"ver\\u0073ion":1,');
      if (fault === 'whitespace') candidate = ` ${candidate}`;
      if (fault === 'no LF') candidate = candidate.trimEnd();
      if (fault === 'CRLF') candidate = `${candidate.trimEnd()}\r\n`;
      if (fault === 'two LF') candidate += '\n';
      if (fault === 'invalid') candidate = '{\n';
      if (fault === 'null') candidate = 'null\n';
      if (fault === 'array') candidate = '[]\n';
      if (fault === 'over bound') candidate = text({ ...record, schema: 'é'.repeat(9_000) });
      if (fault === 'wrong domain') candidate = text(resign(record, surface === 'worker' ? parentDomain : workerDomain));
      if (fault === 'old stage domain') candidate = text(resign(record,
        `E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_${surface.toUpperCase()}_COMMITTED_RESERVE_STAGE_V1`));
      if (fault === 'old cycle domain') candidate = text(resign(record,
        `E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_${surface.toUpperCase()}_CYCLE_STEP_V1`));
      if (fault === 'unseparated domain') candidate = text(resign(record, ''));
      expect(() => surface === 'worker' ? parseWorker(candidate, bindings, f.lineage)
        : parseParent(candidate, bindings, terminal, f.lineage)).toThrow();
    });
  });
  it.each(stages.filter(stage => stage !== 'operational-revalidate'))(
    'refuses fully valid legacy stage %s', stage => {
      const f = fixture();
      const oldWorker = createLegacyWorker(bindings, text(f.failure), text(f.root), text(f.step), stage, 'continuation');
      const oldParent = createLegacyParent(bindings, terminal, text(f.failure), text(f.root), text(f.step),
        text(oldWorker), text(f.parentStep));
      const lineage = { ...f.lineage, workerCommittedReserveStageText: text(oldWorker),
        parentCommittedReserveStageText: text(oldParent) };
      expect(() => createWorker(bindings, lineage, 'revalidator-call')).toThrow();
      expect(() => createParent(bindings, terminal, lineage)).toThrow();
    });
  it.each(['workerFailureText', 'workerRootPhaseV2Text', 'workerCycleStepText',
    'workerCommittedReserveStageText', 'parentCycleStepText', 'parentCommittedReserveStageText',
    'workerRevalidationText'] as const)('requires fully parsed exact ancestor %s', field => {
    const f = fixture(); const other = fixture('callback-observation-guard', 'cycle-2', 'genesis');
    expect(() => parseParent(text(f.parent), bindings, terminal,
      { ...f.lineage, [field]: field === 'workerFailureText'
        ? text(createNativeTwoCycleWorkerFailureDiagnosticV1(bindings, 'pre-root', new Error()))
        : other.lineage[field] })).toThrow();
    expect(() => createParent(bindings, terminal, { ...f.lineage, [field]: '{\n' })).toThrow();
  });
  it('requires exact terminal digest and complete old parent validation', () => {
    const f = fixture();
    expect(() => createParent(bindings, 'e'.repeat(64), f.lineage)).toThrow();
    const corrupted = resign({ ...f.legacyParent, rawCausePublished: true },
      'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_COMMITTED_RESERVE_STAGE_V1');
    expect(() => createParent(bindings, terminal,
      { ...f.lineage, parentCommittedReserveStageText: text(corrupted) })).toThrow();
  });
  it('worker closed-origin assertion is self-consistency, while parent binds the exact asserted origin', () => {
    const f = fixture();
    const changedWorker = resign({ ...f.worker, revalidationOrigin: 'callback-observation-guard' }, workerDomain);
    expect(parseWorker(text(changedWorker), bindings, f.lineage).revalidationOrigin).toBe('callback-observation-guard');
    expect(() => parseParent(text(f.parent), bindings, terminal,
      { ...f.lineage, workerRevalidationText: text(changedWorker) })).toThrow();
    const changedParent = resign({ ...f.parent, revalidationOrigin: 'callback-observation-guard' }, parentDomain);
    expect(() => parseParent(text(changedParent), bindings, terminal, f.lineage)).toThrow();
  });
  it.each(['genesis', 'continuation'] as const)('binds explicit %s kind from old worker and parent', kind => {
    const f = fixture('revalidator-call', 'cycle-1', kind);
    const other = fixture('revalidator-call', 'cycle-1', kind === 'genesis' ? 'continuation' : 'genesis');
    expect(() => parseWorker(text(f.worker), bindings,
      { ...f.lineage, workerCommittedReserveStageText: other.lineage.workerCommittedReserveStageText })).toThrow();
    expect(() => parseParent(text(f.parent), bindings, terminal, other.lineage)).toThrow();
  });
  it.each(['configSha256Hex', 'expectedBridgeCommit', 'pathIdentityDigestHex'] as const)(
    'requires exact binding %s', field => {
      const f = fixture(); const changed = { ...bindings, [field]: replacement(field) } as typeof bindings;
      expect(() => parseWorker(text(f.worker), changed, f.lineage)).toThrow();
      expect(() => parseParent(text(f.parent), changed, terminal, f.lineage)).toThrow();
    });
  it.each([undefined, null, 1, {}, '', 'invalid'])('refuses created unsupported origin %#', origin => {
    const f = fixture(); expect(() => createWorker(bindings, f.lineage, origin as Origin)).toThrow();
  });
  it('does not accept legacy companions under new schemas', () => {
    const f = fixture();
    expect(() => parseWorker(text(f.legacyWorker), bindings, f.lineage)).toThrow();
    expect(() => parseParent(text(f.legacyParent), bindings, terminal, f.lineage)).toThrow();
  });
});
