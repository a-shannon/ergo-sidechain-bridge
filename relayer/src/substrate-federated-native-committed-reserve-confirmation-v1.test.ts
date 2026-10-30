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
  NATIVE_COMMITTED_RESERVE_CONFIRMATION_ORIGINS_V1 as origins,
  tagNativeCommittedReserveConfirmationOriginV1 as tagDetail,
  projectNativeCommittedReserveConfirmationOriginV1 as projectDetail,
  createNativeTwoCycleWorkerCommittedReserveConfirmationV1 as createWorker,
  parseNativeTwoCycleWorkerCommittedReserveConfirmationV1 as parseWorker,
  createNativeTwoCycleParentCommittedReserveConfirmationV1 as createParent,
  parseNativeTwoCycleParentCommittedReserveConfirmationV1 as parseParent,
  type NativeCommittedReserveConfirmationOriginV1 as Origin,
  type NativeCommittedReserveConfirmationCategoryV1 as Category,
  type NativeCommittedReserveConfirmationProjectionV1 as Detail,
  NATIVE_COMMITTED_RESERVE_CONFIRMATION_CATEGORIES_V1 as categories,
} from './substrate-federated-native-committed-reserve-confirmation-v1.js';

const categoryFor = (origin: Origin): Category | null =>
  origin === 'active-guard' ? null : 'observer_failure';
const detailFor = (origin: Origin): Detail =>
  ({ confirmationOrigin: origin, confirmationCategory: categoryFor(origin) }) as Detail;
const tag = <T>(value: T, origin: Origin): T => tagDetail(value, origin, categoryFor(origin));
const project = (value: unknown): Origin | null => projectDetail(value)?.confirmationOrigin ?? null;

type Cycle = 'cycle-1' | 'cycle-2';
const bindings = { configSha256Hex: 'a'.repeat(64), expectedBridgeCommit: 'b'.repeat(40),
  pathIdentityDigestHex: 'c'.repeat(64) };
const terminal = 'd'.repeat(64);
const workerDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_COMMITTED_RESERVE_CONFIRMATION_V1';
const parentDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_COMMITTED_RESERVE_CONFIRMATION_V1';
const text = (value: unknown) => `${canonicalJson(value)}\n`;
const resign = (record: Record<string, unknown>, domain: string) => {
  const { receiptDigestHex: ignored, ...body } = record; void ignored;
  return { ...body, receiptDigestHex: sha256CanonicalJson(body, domain) };
};
function primary(origin: Origin = 'confirmation-observation', cycle: Cycle = 'cycle-1',
  kind: Kind = 'continuation', category: Category | null = categoryFor(origin)) {
  return tagDetail(stepTag(rootTag(stageTag(new Error('opaque'), 'confirmation', kind), cycle),
    cycle, 'committed-reserve'), origin, category);
}
function fixture(origin: Origin = 'confirmation-observation', cycle: Cycle = 'cycle-1',
  kind: Kind = 'continuation', category: Category | null = categoryFor(origin)) {
  const failure = createNativeTwoCycleWorkerFailureDiagnosticV1(bindings, 'root-or-cleanup', new Error());
  const root = createNativeTwoCycleWorkerRootPhaseV2(bindings,
    { primaryPhase: cycle, cleanupErrorCount: 0, ergoNodeStartupPhase: null });
  const step = createNativeTwoCycleWorkerCycleStepV1(bindings, text(failure), text(root),
    { cycle, step: 'committed-reserve' });
  const parentStep = createNativeTwoCycleParentCycleStepV1(bindings, terminal,
    text(failure), text(root), text(step));
  const legacyWorker = createLegacyWorker(bindings, text(failure), text(root), text(step),
    'confirmation', kind);
  const legacyParent = createLegacyParent(bindings, terminal, text(failure), text(root), text(step),
    text(legacyWorker), text(parentStep));
  const workerLineage = { workerFailureText: text(failure), workerRootPhaseV2Text: text(root),
    workerCycleStepText: text(step), workerCommittedReserveStageText: text(legacyWorker) };
  const worker = createWorker(bindings, workerLineage,
    { confirmationOrigin: origin, confirmationCategory: category } as Detail);
  const lineage = { ...workerLineage, parentCycleStepText: text(parentStep),
    parentCommittedReserveStageText: text(legacyParent), workerConfirmationText: text(worker) };
  const parent = createParent(bindings, terminal, lineage);
  return { failure, root, step, parentStep, legacyWorker, legacyParent, worker, parent, lineage };
}

describe('invocation-local committed reserve confirmation origin', () => {
  it('has exactly two frozen origins', () => {
    expect(origins).toEqual(['active-guard', 'confirmation-observation']);
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
          confirmationOrigin: { get() { throw new Error('property read'); } },
        });
        const keys = Reflect.ownKeys(error);
        expect(tag(error, origin)).toBe(error);
        expect(Reflect.ownKeys(error)).toEqual(keys);
        expect(project(error)).toBe(origin);
        expect(stageProject(error)).toEqual({ committedReserveStage: 'confirmation',
          committedReserveKind: kind });
        expect(project(new AggregateError([error, rootTag(new Error(), 'cleanup')]))).toBe(origin);
      });
    });
  });
  it.each([undefined, null, 1, 'opaque', {}, Object.create(Error.prototype),
    new Proxy(new Error(), {})])('preserves and refuses nonnative error %#', value => {
    expect(tag(value, 'confirmation-observation')).toBe(value);
    expect(project(value)).toBeNull();
  });
  it('never consults proxy traps or forged prototypes', () => {
    let traps = 0;
    const handler = { get() { traps++; throw new Error(); },
      getPrototypeOf() { traps++; throw new Error(); },
      getOwnPropertyDescriptor() { traps++; throw new Error(); } };
    const proxy = new Proxy(new Error(), handler);
    expect(tag(proxy, 'confirmation-observation')).toBe(proxy);
    expect(project(proxy)).toBeNull();
    const { proxy: revoked, revoke } = Proxy.revocable(new Error(), handler); revoke();
    expect(tag(revoked, 'confirmation-observation')).toBe(revoked);
    expect(project(revoked)).toBeNull();
    const error = primary(); Object.setPrototypeOf(error, new Proxy(Error.prototype, handler));
    expect(project(error)).toBeNull();
    expect(traps).toBe(0);
  });
  it.each([Object.freeze, Object.preventExtensions])('tags sealed errors privately %#', seal => {
    const error = primary(); seal(error);
    expect(tag(error, 'confirmation-observation')).toBe(error);
    expect(project(error)).toBe('confirmation-observation');
  });
  it.each([null, 1, {}, '', 'invalid', 'Confirmation-observation', 'active-guard'])(
    'permanently refuses conflicted origin %#', invalid => {
      const error = primary(); tag(error, invalid as Origin); tag(error, 'confirmation-observation');
      expect(project(error)).toBeNull();
      expect(stageProject(error)?.committedReserveStage).toBe('confirmation');
    });
  it.each(stages.filter(stage => stage !== 'confirmation'))(
    'does not convert existing stage %s', stage => {
      const error = tag(stepTag(rootTag(stageTag(new Error(), stage, 'continuation'), 'cycle-1'),
        'cycle-1', 'committed-reserve'), 'confirmation-observation');
      expect(project(error)).toBeNull();
      expect(stageProject(error)?.committedReserveStage).toBe(stage);
    });
  it('requires origin and own stage/kind/root/step on the same error', () => {
    for (const missing of ['origin', 'stage', 'kind', 'root', 'step'] as const) {
      const error = new Error();
      if (missing !== 'origin') tag(error, 'confirmation-observation');
      if (missing !== 'stage') stageTag(error, 'confirmation',
        missing === 'kind' ? undefined : 'continuation');
      if (missing !== 'root') rootTag(error, 'cycle-1');
      if (missing !== 'step') stepTag(error, 'cycle-1', 'committed-reserve');
      expect(project(error), missing).toBeNull();
    }
  });
  it.each(['ancestor', 'descendant', 'sibling', 'cleanup'] as const)(
    'does not borrow origin from %s', placement => {
      const error = stepTag(rootTag(stageTag(new Error(), 'confirmation', 'continuation'),
        'cycle-1'), 'cycle-1', 'committed-reserve');
      const wrong = tag(new Error(), 'confirmation-observation');
      const graph = placement === 'ancestor' ? tag(new AggregateError([error]), 'confirmation-observation')
        : placement === 'descendant' ? stepTag(rootTag(stageTag(new AggregateError([wrong]),
          'confirmation', 'continuation'), 'cycle-1'), 'cycle-1', 'committed-reserve')
        : new AggregateError([error, placement === 'cleanup' ? rootTag(wrong, 'cleanup') : wrong]);
      expect(stageProject(graph)?.committedReserveStage).toBe('confirmation');
      expect(project(graph)).toBeNull();
    });
  it('counts repeated primary identity once while checking the whole graph', () => {
    const error = primary();
    expect(project(new AggregateError([error, error]))).toBe('confirmation-observation');
    const graph = new AggregateError([error, ...Array.from({ length: 62 }, () => new Error())]);
    expect(project(graph)).toBe('confirmation-observation');
    graph.errors.push(new Error()); expect(project(graph)).toBeNull();
  });
  it.each(['two origins', 'two primaries', 'conflicted sibling', 'cleanup origin',
    'cleanup ancestor', 'shared cleanup', 'cycle graph', 'primitive tail', 'sparse', 'getter child',
    'getter errors', 'proxy children', 'iterator', 'array prototype', 'wrong step', 'wrong cycle',
    'conflicted stage', 'conflicted kind'] as const)('fails closed on %s', fault => {
    const error = primary(); const graph = new AggregateError([error]);
    let candidate: unknown = graph;
    if (fault === 'two origins') graph.errors.push(tag(new Error(), 'confirmation-observation'));
    if (fault === 'two primaries') graph.errors.push(primary());
    if (fault === 'conflicted sibling') {
      const sibling = tag(new Error(), 'confirmation-observation'); tag(sibling, 'active-guard');
      graph.errors.push(sibling);
    }
    if (fault === 'cleanup origin') graph.errors.push(rootTag(tag(new Error(), 'confirmation-observation'), 'cleanup'));
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
    if (fault === 'conflicted kind') stageTag(error, 'confirmation', 'genesis');
    expect(project(candidate)).toBeNull();
  });
  it('does not infer origin from caller properties or an error cause', () => {
    const error = stepTag(rootTag(stageTag(Object.assign(new Error('confirmation-observation'),
      { confirmationOrigin: 'confirmation-observation', cause: primary() }), 'confirmation',
    'continuation'), 'cycle-1'), 'cycle-1', 'committed-reserve');
    expect(project(error)).toBeNull();
  });
  it('refuses a native aggregate whose Error prototype masks its own errors graph', () => {
    const error = new AggregateError(['hostile tail']);
    Object.setPrototypeOf(error, Error.prototype);
    stageTag(error, 'confirmation', 'continuation');
    rootTag(error, 'cycle-1'); stepTag(error, 'cycle-1', 'committed-reserve');
    expect(tag(error, 'confirmation-observation')).toBe(error);
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
        stageTag(error, 'confirmation', 'continuation');
        rootTag(error, 'cycle-1'); stepTag(error, 'cycle-1', 'committed-reserve');
        expect(tag(error, 'confirmation-observation')).toBe(error);
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
    expect(tag(error, 'confirmation-observation')).toBe(error);
    expect(project(error)).toBe('confirmation-observation');
    expect(tag(graph, 'confirmation-observation')).toBe(graph);
    // An ancestor origin remains invalid; its exact thrown identity is preserved.
    expect(project(graph)).toBeNull();
    expect(project(new AggregateError([error, new Error()]))).toBe('confirmation-observation');
  });
});
const validDetails: readonly Detail[] = [
  { confirmationOrigin: 'active-guard', confirmationCategory: null },
  ...categories.map(confirmationCategory => ({
    confirmationOrigin: 'confirmation-observation' as const, confirmationCategory,
  })),
];
const invalidDetails = [
  ...categories.map(confirmationCategory => ({ confirmationOrigin: 'active-guard', confirmationCategory })),
  ...[null, undefined, '', 'confirmation_phase_failure', 'unknown', 1, {}, [], 'Observer_failure']
    .map(confirmationCategory => ({ confirmationOrigin: 'confirmation-observation', confirmationCategory })),
  ...[null, undefined, 'ACTIVE-GUARD', '', 1, {}]
    .map(confirmationOrigin => ({ confirmationOrigin, confirmationCategory: null })),
];

describe('confirmation origin/category closed combinations', () => {
  it('has exactly the seven genuine frozen categories', () => {
    expect(categories).toEqual(['managed_deadline_elapsed', 'confirmation_budget_elapsed',
      'clock_failure', 'observer_failure', 'pending_at_deadline', 'not_found_at_deadline',
      'observation_completed_after_deadline']);
    expect(Object.isFrozen(categories)).toBe(true);
  });
  describe.each(['cycle-1', 'cycle-2'] as const)('%s', cycle => {
    describe.each(['genesis', 'continuation'] as const)('%s', kind => {
      it.each(validDetails)('projects and roundtrips %j', detail => {
        const error = primary(detail.confirmationOrigin, cycle, kind, detail.confirmationCategory);
        const projected = projectDetail(error);
        expect(projected).toEqual(detail);
        expect(Object.isFrozen(projected)).toBe(true);
        const f = fixture(detail.confirmationOrigin, cycle, kind, detail.confirmationCategory);
        expect(parseWorker(text(f.worker), bindings, f.lineage)).toMatchObject(detail);
        expect(parseParent(text(f.parent), bindings, terminal, f.lineage)).toMatchObject(detail);
        expect(Object.keys(projected!)).toEqual(['confirmationOrigin', 'confirmationCategory']);
      });
    });
  });
  it.each(invalidDetails)('permanently refuses invalid metadata and codecs %j', detail => {
    const f = fixture();
    expect(() => createWorker(bindings, f.lineage, detail as Detail)).toThrow();
    const error = primary('active-guard');
    expect(tagDetail(error, detail.confirmationOrigin as Origin,
      detail.confirmationCategory as Category)).toBe(error);
    tagDetail(error, 'active-guard');
    expect(projectDetail(error)).toBeNull();
    if (detail.confirmationOrigin === undefined || detail.confirmationCategory === undefined) {
      expect(() => text({ ...f.worker, ...detail })).toThrow();
      return;
    }
    const worker = resign({ ...f.worker, ...detail }, workerDomain);
    const parent = resign({ ...f.parent, ...detail }, parentDomain);
    expect(() => parseWorker(text(worker), bindings, f.lineage)).toThrow();
    expect(() => parseParent(text(parent), bindings, terminal, f.lineage)).toThrow();
  });
  it.each(categories.filter(category => category !== 'observer_failure'))(
    'permanently refuses category conflict %s without changing old stage', category => {
      const error = primary();
      tagDetail(error, 'confirmation-observation', category);
      tagDetail(error, 'confirmation-observation', 'observer_failure');
      expect(projectDetail(error)).toBeNull();
      expect(stageProject(error)).toEqual({ committedReserveStage: 'confirmation',
        committedReserveKind: 'continuation' });
    });
  it.each(['origin', 'category'] as const)('rejects hostile %s without invoking it', field => {
    let consulted = 0;
    const handler = { get() { consulted++; throw new Error(); },
      getOwnPropertyDescriptor() { consulted++; throw new Error(); },
      getPrototypeOf() { consulted++; throw new Error(); } };
    const hostile = new Proxy({}, handler);
    const { proxy: revoked, revoke } = Proxy.revocable({}, handler); revoke();
    for (const value of [hostile, revoked]) {
      const error = primary('active-guard');
      if (field === 'origin') tagDetail(error, value as Origin);
      else tagDetail(error, 'confirmation-observation', value as Category);
      expect(projectDetail(error)).toBeNull();
    }
    expect(consulted).toBe(0);
  });
  it.each(['origin getter', 'category getter', 'inherited', 'extra', 'non-enumerable',
    'null', 'array', 'revoked proxy'] as const)('requires own exact data detail: %s', fault => {
      const f = fixture(); let consulted = 0;
      let detail: unknown = detailFor('active-guard');
      if (fault === 'origin getter' || fault === 'category getter') {
        detail = { ...detailFor('active-guard') };
        Object.defineProperty(detail, fault === 'origin getter'
          ? 'confirmationOrigin' : 'confirmationCategory', {
          enumerable: true, get() { consulted++; throw new Error('getter consulted'); },
        });
      }
      if (fault === 'inherited') detail = Object.create(detailFor('active-guard'));
      if (fault === 'extra') detail = { ...detailFor('active-guard'), rawCause: 'opaque' };
      if (fault === 'non-enumerable') {
        detail = Object.defineProperties({}, {
          confirmationOrigin: { value: 'active-guard' }, confirmationCategory: { value: null },
        });
      }
      if (fault === 'null') detail = null;
      if (fault === 'array') detail = [];
      if (fault === 'revoked proxy') {
        const revocable = Proxy.revocable(detailFor('active-guard'), {});
        revocable.revoke(); detail = revocable.proxy;
      }
      expect(() => createWorker(bindings, f.lineage, detail as Detail)).toThrow();
      expect(consulted).toBe(0);
    });
  it.each(['worker', 'parent'] as const)('%s rejects uppercase hashes after rehash', surface => {
    const f = fixture(); const record = surface === 'worker' ? f.worker : f.parent;
    const domain = surface === 'worker' ? workerDomain : parentDomain;
    for (const field of Object.keys(record).filter(key => key.endsWith('Hex') || key === 'expectedBridgeCommit')) {
      const value = record[field as keyof typeof record];
      const changed = { ...record, [field]: String(value).toUpperCase() };
      const candidate = text(field === 'receiptDigestHex' ? changed : resign(changed, domain));
      expect(() => surface === 'worker' ? parseWorker(candidate, bindings, f.lineage)
        : parseParent(candidate, bindings, terminal, f.lineage), field).toThrow();
    }
  });
  it('worker category is self-consistency and parent binds its exact category assertion', () => {
    const f = fixture();
    const changed = resign({ ...f.worker, confirmationCategory: 'clock_failure' }, workerDomain);
    expect(parseWorker(text(changed), bindings, f.lineage).confirmationCategory).toBe('clock_failure');
    expect(() => parseParent(text(f.parent), bindings, terminal,
      { ...f.lineage, workerConfirmationText: text(changed) })).toThrow();
    const parent = resign({ ...f.parent, confirmationCategory: 'clock_failure' }, parentDomain);
    expect(() => parseParent(text(parent), bindings, terminal, f.lineage)).toThrow();
  });
});

const workerFields = ['schema', 'version', 'status', 'configSha256Hex', 'expectedBridgeCommit',
  'pathIdentityDigestHex', 'workerFailureReceiptDigestHex', 'workerRootPhaseV2ReceiptDigestHex',
  'workerCycleStepReceiptDigestHex', 'workerCommittedReserveStageReceiptDigestHex', 'cycle', 'step',
  'committedReserveStage', 'committedReserveKind', 'confirmationOrigin', 'confirmationCategory', 'operationCompletionEstablished',
  'rootCleanupEstablished', 'rawCausePublished', 'receiptDigestHex'];
const parentFields = [...workerFields, 'failureReceiptDigestHex', 'parentCycleStepReceiptDigestHex',
  'parentCommittedReserveStageReceiptDigestHex', 'workerConfirmationReceiptDigestHex'];
function replacement(field: string): unknown {
  if (field.endsWith('Established') || field === 'rawCausePublished') return true;
  if (field === 'version') return 2;
  if (field === 'cycle') return 'cycle-2';
  if (field === 'step') return 'source-lock';
  if (field === 'committedReserveStage') return 'operational-sign';
  if (field === 'committedReserveKind') return 'genesis';
  if (field === 'confirmationOrigin') return 'unclassified';
  if (field === 'expectedBridgeCommit') return 'e'.repeat(40);
  return field.endsWith('Hex') ? 'e'.repeat(64) : 'other';
}

describe('committed reserve confirmation canonical diagnostic companions', () => {
  describe.each(['cycle-1', 'cycle-2'] as const)('%s', cycle => {
    describe.each(['genesis', 'continuation'] as const)('%s', kind => {
      it.each(origins)('roundtrips %s with exact legacy lineage and false claims', origin => {
        const f = fixture(origin, cycle, kind);
        expect(parseWorker(text(f.worker), bindings, f.lineage)).toEqual(f.worker);
        expect(parseParent(text(f.parent), bindings, terminal, f.lineage)).toEqual(f.parent);
        expect(f.worker).toMatchObject({ cycle, step: 'committed-reserve',
          committedReserveStage: 'confirmation', committedReserveKind: kind,
          confirmationOrigin: origin, confirmationCategory: categoryFor(origin), workerCommittedReserveStageReceiptDigestHex: f.legacyWorker.receiptDigestHex,
          operationCompletionEstablished: false, rootCleanupEstablished: false, rawCausePublished: false });
        expect(f.parent).toMatchObject({ parentCommittedReserveStageReceiptDigestHex: f.legacyParent.receiptDigestHex,
          workerConfirmationReceiptDigestHex: f.worker.receiptDigestHex, failureReceiptDigestHex: terminal,
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
      'old cycle domain', 'revalidation domain', 'unseparated domain'] as const)('refuses %s', fault => {
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
      if (fault === 'revalidation domain') candidate = text(resign(record,
        `E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_${surface.toUpperCase()}_COMMITTED_RESERVE_REVALIDATION_V1`));
      if (fault === 'unseparated domain') candidate = text(resign(record, ''));
      expect(() => surface === 'worker' ? parseWorker(candidate, bindings, f.lineage)
        : parseParent(candidate, bindings, terminal, f.lineage)).toThrow();
    });
  });
  it.each(stages.filter(stage => stage !== 'confirmation'))(
    'refuses fully valid legacy stage %s', stage => {
      const f = fixture();
      const oldWorker = createLegacyWorker(bindings, text(f.failure), text(f.root), text(f.step), stage, 'continuation');
      const oldParent = createLegacyParent(bindings, terminal, text(f.failure), text(f.root), text(f.step),
        text(oldWorker), text(f.parentStep));
      const lineage = { ...f.lineage, workerCommittedReserveStageText: text(oldWorker),
        parentCommittedReserveStageText: text(oldParent) };
      expect(() => createWorker(bindings, lineage, detailFor('confirmation-observation'))).toThrow();
      expect(() => createParent(bindings, terminal, lineage)).toThrow();
    });
  it.each(['workerFailureText', 'workerRootPhaseV2Text', 'workerCycleStepText',
    'workerCommittedReserveStageText', 'parentCycleStepText', 'parentCommittedReserveStageText',
    'workerConfirmationText'] as const)('requires fully parsed exact ancestor %s', field => {
    const f = fixture(); const other = fixture('active-guard', 'cycle-2', 'genesis');
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
    const changedWorker = resign({ ...f.worker, confirmationOrigin: 'active-guard', confirmationCategory: null }, workerDomain);
    expect(parseWorker(text(changedWorker), bindings, f.lineage).confirmationOrigin).toBe('active-guard');
    expect(() => parseParent(text(f.parent), bindings, terminal,
      { ...f.lineage, workerConfirmationText: text(changedWorker) })).toThrow();
    const changedParent = resign({ ...f.parent, confirmationOrigin: 'active-guard', confirmationCategory: null }, parentDomain);
    expect(() => parseParent(text(changedParent), bindings, terminal, f.lineage)).toThrow();
  });
  it.each(['genesis', 'continuation'] as const)('binds explicit %s kind from old worker and parent', kind => {
    const f = fixture('confirmation-observation', 'cycle-1', kind);
    const other = fixture('confirmation-observation', 'cycle-1', kind === 'genesis' ? 'continuation' : 'genesis');
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
    const f = fixture(); expect(() => createWorker(bindings, f.lineage, detailFor(origin as Origin))).toThrow();
  });
  it('does not accept legacy companions under new schemas', () => {
    const f = fixture();
    expect(() => parseWorker(text(f.legacyWorker), bindings, f.lineage)).toThrow();
    expect(() => parseParent(text(f.legacyParent), bindings, terminal, f.lineage)).toThrow();
  });
});
