import { describe, expect, it, vi } from 'vitest';
import * as json from './ergo-settlement-core/strict-json.js';
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
import { tagSubstrateFederatedNativeCommittedReserveFailureStageV1 as stageTag,
  createNativeTwoCycleWorkerCommittedReserveStageV1 as createStageWorker,
  createNativeTwoCycleParentCommittedReserveStageV1 as createStageParent,
  type SubstrateFederatedNativeCommittedReserveKindV1 as Kind }
  from './substrate-federated-native-committed-reserve-failure-v1.js';
import { tagNativeCommittedReserveRevalidationOriginV1 as originTag,
  createNativeTwoCycleWorkerCommittedReserveRevalidationV1 as createOriginWorker,
  createNativeTwoCycleParentCommittedReserveRevalidationV1 as createOriginParent,
  type NativeCommittedReserveRevalidationOriginV1 as Origin }
  from './substrate-federated-native-committed-reserve-revalidation-v1.js';
import { NATIVE_COMMITTED_RESERVE_REVALIDATION_OPERATIONS_V1 as operations,
  NATIVE_COMMITTED_RESERVE_INPUT_REFUSAL_ROLES_V1,
  createNativeCommittedReserveInputRefusalTaggerV1,
  projectNativeCommittedReserveInputRefusalV1,
  type NativeCommittedReserveInputRefusalV1,
  createNativeCommittedReserveRevalidationOperationTaggerV1 as factory,
  projectNativeCommittedReserveRevalidationOperationV1 as project,
  createNativeTwoCycleWorkerCommittedReserveRevalidationOperationV1 as createWorker,
  parseNativeTwoCycleWorkerCommittedReserveRevalidationOperationV1 as parseWorker,
  createNativeTwoCycleParentCommittedReserveRevalidationOperationV1 as createParent,
  parseNativeTwoCycleParentCommittedReserveRevalidationOperationV1 as parseParent,
  type NativeCommittedReserveRevalidationOperationV1 as Operation }
  from './substrate-federated-native-committed-reserve-revalidation-operation-v1.js';

type Cycle = 'cycle-1' | 'cycle-2';
const bindings = { configSha256Hex: 'a'.repeat(64), expectedBridgeCommit: 'b'.repeat(40),
  pathIdentityDigestHex: 'c'.repeat(64) };
const terminal = 'd'.repeat(64);
const workerDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_COMMITTED_RESERVE_REVALIDATION_OPERATION_V1';
const parentDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_COMMITTED_RESERVE_REVALIDATION_OPERATION_V1';
const text = (value: unknown) => `${json.canonicalJson(value)}\n`;

describe('source-owned input refusal metadata', () => {
  const detail = { refusalCode: 'source-funding-present', nodeRole: 'primary' } as const;
  const allowed = Object.entries(NATIVE_COMMITTED_RESERVE_INPUT_REFUSAL_ROLES_V1)
    .flatMap(([refusalCode, roles]) => roles.map(nodeRole => ({ refusalCode, nodeRole } as NativeCommittedReserveInputRefusalV1)));
  it('closes exactly eight source predicates and three roles', () => {
    expect(Object.keys(NATIVE_COMMITTED_RESERVE_INPUT_REFUSAL_ROLES_V1)).toEqual([
      'source-funding-present', 'transition-input-unavailable', 'transition-input-bytes-changed', 'source-refund-timeout',
      'successor-creation-height-window', 'paired-observations-disagree', 'check-ancestry-window-exceeded',
      'input-observation-convergence-exhausted']);
    expect(Object.isFrozen(NATIVE_COMMITTED_RESERVE_INPUT_REFUSAL_ROLES_V1)).toBe(true);
  });
  it.each(allowed)('preserves exact error for $refusalCode/$nodeRole in both observation phases', d => {
    for (const operation of ['input-observation-before-check', 'input-observation-after-check'] as const) {
      if (d.refusalCode === 'check-ancestry-window-exceeded' && operation === 'input-observation-before-check') continue;
      const error = primary(); const keys = Reflect.ownKeys(error); factory()(error, operation);
      const tag = createNativeCommittedReserveInputRefusalTaggerV1();
      expect(tag(error, d)).toBe(error); expect(tag(error, d)).toBe(error);
      expect(Reflect.ownKeys(error)).toEqual(keys); expect(error.message).toBe('opaque');
      expect(projectNativeCommittedReserveInputRefusalV1(new AggregateError([error, error]))).toEqual(d);
      expect(Object.isFrozen(projectNativeCommittedReserveInputRefusalV1(error))).toBe(true);
      expect(project(error)).toBe(operation);
    }
  });
  it.each(allowed.flatMap(d => ['primary', 'witness', 'pair', 'session'].filter(role =>
    !(NATIVE_COMMITTED_RESERVE_INPUT_REFUSAL_ROLES_V1[d.refusalCode] as readonly string[]).includes(role))
    .map(nodeRole => [d.refusalCode, nodeRole] as const)))('refuses invalid code-role %s/%s', (refusalCode, nodeRole) => {
    const error = tagged('input-observation-before-check');
    expect(createNativeCommittedReserveInputRefusalTaggerV1()(error, { refusalCode, nodeRole } as NativeCommittedReserveInputRefusalV1)).toBe(error);
    expect(projectNativeCommittedReserveInputRefusalV1(error)).toBeNull();
    expect(project(error)).toBe('input-observation-before-check');
  });
  it.each(['cross-token', 'code', 'role', 'invalid'] as const)('permanently poisons %s reuse without changing operation', fault => {
    const error = tagged('input-observation-before-check'); const tag = createNativeCommittedReserveInputRefusalTaggerV1(); tag(error, detail);
    if (fault === 'cross-token') createNativeCommittedReserveInputRefusalTaggerV1()(error, detail);
    else tag(error, fault === 'code' ? { ...detail, refusalCode: 'transition-input-unavailable' }
      : fault === 'role' ? { ...detail, nodeRole: 'witness' } : {} as NativeCommittedReserveInputRefusalV1);
    tag(error, detail); expect(projectNativeCommittedReserveInputRefusalV1(error)).toBeNull();
    expect(project(error)).toBe('input-observation-before-check');
  });
  it.each(['primary', 'witness'] as const)('refuses before-check ancestry metadata for %s', nodeRole => {
    const error = tagged('input-observation-before-check');
    createNativeCommittedReserveInputRefusalTaggerV1()(error, { refusalCode: 'check-ancestry-window-exceeded', nodeRole });
    expect(projectNativeCommittedReserveInputRefusalV1(error)).toBeNull();
    expect(project(error)).toBe('input-observation-before-check');
  });
  it.each(operations.filter(operation => !operation.startsWith('input-observation-')))('refuses operation %s', operation => {
    const error = tagged(operation); createNativeCommittedReserveInputRefusalTaggerV1()(error, detail);
    expect(projectNativeCommittedReserveInputRefusalV1(error)).toBeNull();
  });
  it.each(['missing-operation', 'different-error', 'two-primary', 'cleanup-ancestor', 'cycle', 'stage', 'origin', 'step'] as const)(
    'requires exact own primary association %s', fault => {
      const error = primary(); if (fault !== 'missing-operation') factory()(error, 'input-observation-before-check');
      const sibling = new Error(); createNativeCommittedReserveInputRefusalTaggerV1()(fault === 'different-error' ? sibling : error, detail);
      if (fault === 'cycle') stepTag(error, 'cycle-2', 'committed-reserve');
      if (fault === 'stage') stageTag(error, 'operational-sign', 'continuation');
      if (fault === 'origin') originTag(error, 'callback-observation-guard');
      if (fault === 'step') stepTag(error, 'cycle-1', 'source-lock');
      const graph = new AggregateError([error, sibling]);
      if (fault === 'two-primary') graph.errors.push(primary());
      if (fault === 'cleanup-ancestor') rootTag(graph, 'cleanup');
      expect(projectNativeCommittedReserveInputRefusalV1(graph)).toBeNull();
    });
  it.each(['error-proxy', 'prototype-proxy', 'array-proxy', 'array-prototype-proxy', 'child-getter', 'detail-proxy', 'detail-getter'] as const)(
    'rejects hostile %s without effects', fault => {
      let effects = 0; const traps = { get() { effects++; throw Error(); }, getPrototypeOf() { effects++; throw Error(); },
        ownKeys() { effects++; throw Error(); }, getOwnPropertyDescriptor() { effects++; throw Error(); } };
      const error = tagged('input-observation-before-check'); const graph = new AggregateError([error]); let value: unknown = graph;
      let selected: object = detail;
      if (fault === 'error-proxy') value = new Proxy(error, traps);
      if (fault === 'prototype-proxy') Object.setPrototypeOf(error, new Proxy(Error.prototype, traps));
      if (fault === 'array-proxy') graph.errors = new Proxy(graph.errors, traps);
      if (fault === 'array-prototype-proxy') Object.setPrototypeOf(graph.errors, new Proxy(Array.prototype, traps));
      if (fault === 'child-getter') Object.defineProperty(graph.errors, '0', { get() { effects++; throw Error(); } });
      if (fault === 'detail-proxy') selected = new Proxy(detail, traps);
      if (fault === 'detail-getter') { selected = { ...detail }; Object.defineProperty(selected, 'refusalCode', { get() { effects++; throw Error(); } }); }
      expect(createNativeCommittedReserveInputRefusalTaggerV1()(error, selected as NativeCommittedReserveInputRefusalV1)).toBe(error);
      expect(projectNativeCommittedReserveInputRefusalV1(value)).toBeNull(); expect(effects).toBe(0);
    });
  it.each([null, undefined, 'source-funding-present', 1, {}, Object.create(Error.prototype)])('refuses non-native %#', value => {
    expect(createNativeCommittedReserveInputRefusalTaggerV1()(value, detail)).toBe(value);
    expect(projectNativeCommittedReserveInputRefusalV1(value)).toBeNull();
  });
  it('does not infer predicate from messages, fields or cause', () => {
    const error = tagged('input-observation-before-check'); error.message = detail.refusalCode;
    Object.assign(error, detail, { cause: primary() }); expect(projectNativeCommittedReserveInputRefusalV1(error)).toBeNull();
  });
  it('preserves the primary with an independent untagged cleanup sibling but refuses cleanup attribution', () => {
    const error = tagged('input-observation-before-check'); createNativeCommittedReserveInputRefusalTaggerV1()(error, detail);
    const cleanup = rootTag(new Error('cleanup'), 'cleanup'); const graph = new AggregateError([error, cleanup]);
    expect(projectNativeCommittedReserveInputRefusalV1(graph)).toEqual(detail);
    expect(project(graph)).toBe('input-observation-before-check');
    createNativeCommittedReserveInputRefusalTaggerV1()(cleanup, detail);
    expect(projectNativeCommittedReserveInputRefusalV1(graph)).toBeNull();
    expect(project(graph)).toBe('input-observation-before-check');
  });
  it('refuses a primary also reachable through cleanup ancestry', () => {
    const error = tagged('input-observation-after-check'); createNativeCommittedReserveInputRefusalTaggerV1()(error, detail);
    expect(projectNativeCommittedReserveInputRefusalV1(new AggregateError([error,
      rootTag(new AggregateError([error]), 'cleanup')]))).toBeNull();
  });
  it('does not revive a prior refusal after cross-invocation reuse on a temporarily hostile error', () => {
    const error = tagged('input-observation-before-check'); const first = createNativeCommittedReserveInputRefusalTaggerV1();
    first(error, detail); Object.defineProperty(error, 'cause', { configurable: true, get() { throw Error('unread'); } });
    createNativeCommittedReserveInputRefusalTaggerV1()(error, detail); Reflect.deleteProperty(error, 'cause'); first(error, detail);
    expect(projectNativeCommittedReserveInputRefusalV1(error)).toBeNull(); expect(project(error)).toBe('input-observation-before-check');
  });
  it('retains the complete graph bound and refuses masked AggregateErrors', () => {
    const error = tagged('input-observation-before-check'); createNativeCommittedReserveInputRefusalTaggerV1()(error, detail);
    const graph = new AggregateError([error, ...Array.from({ length: 62 }, () => new Error())]);
    expect(projectNativeCommittedReserveInputRefusalV1(graph)).toEqual(detail);
    graph.errors.push(new Error()); expect(projectNativeCommittedReserveInputRefusalV1(graph)).toBeNull();
    const masked = new AggregateError([error]); Object.setPrototypeOf(masked, Error.prototype);
    expect(projectNativeCommittedReserveInputRefusalV1(masked)).toBeNull();
  });
});
const resign = (record: object, domain: string) => {
  const { receiptDigestHex: ignored, ...body } = record as Record<string, unknown>; void ignored;
  return { ...body, receiptDigestHex: json.sha256CanonicalJson(body, domain) };
};
function primary(cycle: Cycle = 'cycle-1', kind: Kind = 'continuation', origin: Origin = 'revalidator-call') {
  return originTag(stepTag(rootTag(stageTag(new Error('opaque'), 'operational-revalidate', kind), cycle),
    cycle, 'committed-reserve'), origin);
}
function tagged(operation: Operation = operations[0]) {
  const error = primary(); factory()(error, operation); return error;
}
function fixture(operation: Operation = operations[0], cycle: Cycle = 'cycle-1',
  kind: Kind = 'continuation', origin: Origin = 'revalidator-call') {
  const failure = createNativeTwoCycleWorkerFailureDiagnosticV1(bindings, 'root-or-cleanup', new Error());
  const root = createNativeTwoCycleWorkerRootPhaseV2(bindings,
    { primaryPhase: cycle, cleanupErrorCount: 0, ergoNodeStartupPhase: null });
  const step = createNativeTwoCycleWorkerCycleStepV1(bindings, text(failure), text(root),
    { cycle, step: 'committed-reserve' });
  const parentStep = createNativeTwoCycleParentCycleStepV1(bindings, terminal, text(failure), text(root), text(step));
  const stageWorker = createStageWorker(bindings, text(failure), text(root), text(step), 'operational-revalidate', kind);
  const stageParent = createStageParent(bindings, terminal, text(failure), text(root), text(step), text(stageWorker), text(parentStep));
  const oldWorkerLineage = { workerFailureText: text(failure), workerRootPhaseV2Text: text(root),
    workerCycleStepText: text(step), workerCommittedReserveStageText: text(stageWorker) };
  const originWorker = createOriginWorker(bindings, oldWorkerLineage, origin);
  const oldParentLineage = { ...oldWorkerLineage, parentCycleStepText: text(parentStep),
    parentCommittedReserveStageText: text(stageParent), workerRevalidationText: text(originWorker) };
  const originParent = createOriginParent(bindings, terminal, oldParentLineage);
  const workerLineage = { ...oldWorkerLineage, workerRevalidationText: text(originWorker) };
  const worker = origin === 'revalidator-call' ? createWorker(bindings, workerLineage, operation) : undefined;
  const lineage = { ...oldParentLineage, parentRevalidationText: text(originParent),
    workerRevalidationOperationText: worker === undefined ? '' : text(worker) };
  const parent = worker === undefined ? undefined : createParent(bindings, terminal, lineage);
  return { failure, root, step, stageWorker, stageParent, originWorker, originParent,
    workerLineage, lineage, worker: worker!, parent: parent! };
}

describe('source-invocation revalidation operation metadata', () => {
  it('has exactly six frozen last-entered operations', () => {
    expect(operations).toEqual(['ingress-binding', 'input-observation-before-check', 'fresh-signed-check',
      'input-observation-after-check', 'post-check-observation-join', 'final-authorizer-binding']);
    expect(Object.isFrozen(operations)).toBe(true);
  });
  describe.each(['cycle-1', 'cycle-2'] as const)('%s', cycle => {
    describe.each(['genesis', 'continuation'] as const)('%s', kind => {
      it.each(operations)('preserves exact error and projects %s', operation => {
        const error = primary(cycle, kind); const tag = factory();
        const keys = Reflect.ownKeys(error); const message = error.message;
        expect(tag(error, operation)).toBe(error);
        expect(tag(error, operation)).toBe(error);
        expect(error.message).toBe(message); expect(Reflect.ownKeys(error)).toEqual(keys);
        expect(project(error)).toBe(operation);
        expect(project(new AggregateError([error, rootTag(new Error(), 'cleanup')]))).toBe(operation);
      });
    });
  });
  it.each([Object.freeze, Object.preventExtensions])('preserves sealed errors %#', seal => {
    const error = primary(); seal(error); expect(factory()(error, operations[0])).toBe(error);
    expect(project(error)).toBe(operations[0]);
  });
  it.each([undefined, null, 1, 'opaque', {}, Object.create(Error.prototype)])('refuses non-native %#', value => {
    expect(factory()(value, operations[0])).toBe(value); expect(project(value)).toBeNull();
  });
  it.each(operations)('invalidates cross-invocation reuse even with identical %s', operation => {
    const error = primary(); const first = factory(); const second = factory();
    first(error, operation); expect(project(error)).toBe(operation);
    expect(second(error, operation)).toBe(error); first(error, operation);
    expect(project(error)).toBeNull();
  });
  it.each(operations.slice(1))('invalidates conflicting phase %s permanently', operation => {
    const error = primary(); const tag = factory(); tag(error, operations[0]);
    tag(error, operation); tag(error, operations[0]); expect(project(error)).toBeNull();
  });
  it.each([undefined, null, 1, {}, '', 'cause', 'Ingress-binding'])('refuses unsupported phase %#', value => {
    const error = primary(); const tag = factory(); tag(error, operations[0]);
    expect(tag(error, value as Operation)).toBe(error); tag(error, operations[0]); expect(project(error)).toBeNull();
  });
  it('does not revive an old token after cross-invocation reuse on a temporarily hostile error', () => {
    const error = primary(); const first = factory(); first(error, operations[0]);
    Object.defineProperty(error, 'cause', { configurable: true, get() { throw new Error('unread'); } });
    factory()(error, operations[0]); Reflect.deleteProperty(error, 'cause');
    first(error, operations[0]); expect(project(error)).toBeNull();
  });
  it.each(['origin', 'stage', 'kind', 'root', 'step', 'operation'] as const)('requires own %s', missing => {
    const error = new Error();
    if (missing !== 'origin') originTag(error, 'revalidator-call');
    if (missing !== 'stage') stageTag(error, 'operational-revalidate', missing === 'kind' ? undefined : 'continuation');
    if (missing !== 'root') rootTag(error, 'cycle-1');
    if (missing !== 'step') stepTag(error, 'cycle-1', 'committed-reserve');
    if (missing !== 'operation') factory()(error, operations[0]);
    expect(project(error)).toBeNull();
  });
  it.each(['callback origin', 'wrong stage', 'wrong kind', 'wrong cycle', 'wrong step',
    'two primaries', 'untagged primary', 'tagged sibling', 'tagged ancestor', 'cleanup primary', 'cleanup ancestor',
    'shared cleanup', 'cyclic graph', 'primitive tail', 'sparse array', 'own iterator', 'array prototype',
    'masked aggregate', 'masked child', 'ordinary errors'] as const)('refuses graph %s', fault => {
    const error = fault === 'cleanup primary'
      ? originTag(stepTag(rootTag(stageTag(new Error('opaque'), 'operational-revalidate', 'continuation'),
        'cleanup'), 'cycle-1', 'committed-reserve'), 'revalidator-call') : primary();
    factory()(error, operations[0]);
    const graph = new AggregateError([error]); let value: unknown = graph;
    if (fault === 'callback origin') originTag(error, 'callback-observation-guard');
    if (fault === 'wrong stage') stageTag(error, 'operational-sign', 'continuation');
    if (fault === 'wrong kind') stageTag(error, 'operational-revalidate', 'genesis');
    if (fault === 'wrong cycle') stepTag(error, 'cycle-2', 'committed-reserve');
    if (fault === 'wrong step') stepTag(error, 'cycle-1', 'source-lock');
    if (fault === 'two primaries') graph.errors.push(tagged());
    if (fault === 'untagged primary') graph.errors.push(rootTag(new Error(), 'cycle-1'));
    if (fault === 'tagged sibling') graph.errors.push(factory()(new Error(), operations[0]));
    if (fault === 'tagged ancestor') factory()(graph, operations[0]);
    if (fault === 'cleanup ancestor') rootTag(graph, 'cleanup');
    if (fault === 'shared cleanup') value = new AggregateError([graph, rootTag(new AggregateError([graph]), 'cleanup')]);
    if (fault === 'cyclic graph') graph.errors.push(graph);
    if (fault === 'primitive tail') graph.errors.push('opaque');
    if (fault === 'sparse array') graph.errors.length = 2;
    if (fault === 'own iterator') graph.errors[Symbol.iterator] = function* () { throw new Error(); };
    if (fault === 'array prototype') Object.setPrototypeOf(graph.errors, null);
    if (fault === 'masked aggregate') { Object.setPrototypeOf(graph, Error.prototype); factory()(graph, operations[0]); }
    if (fault === 'masked child') {
      const child = new AggregateError([]); Object.setPrototypeOf(child, Error.prototype); graph.errors.push(child);
    }
    if (fault === 'ordinary errors') Object.defineProperty(error, 'errors', { value: [] });
    expect(project(value)).toBeNull();
  });
  it('counts shared primary once and enforces the complete 64-value graph bound', () => {
    const error = tagged(); expect(project(new AggregateError([error, error]))).toBe(operations[0]);
    const graph = new AggregateError([error, ...Array.from({ length: 62 }, () => new Error())]);
    expect(project(graph)).toBe(operations[0]); graph.errors.push(new Error()); expect(project(graph)).toBeNull();
  });
  it.each(['error', 'error prototype', 'ancestor prototype', 'array', 'array prototype', 'child', 'revoked'] as const)(
    'rejects %s proxies before any trap', placement => {
      let traps = 0;
      const handler: ProxyHandler<object> = { get() { traps++; throw new Error(); },
        getPrototypeOf() { traps++; throw new Error(); }, ownKeys() { traps++; throw new Error(); },
        getOwnPropertyDescriptor() { traps++; throw new Error(); } };
      const error = tagged(); const graph = new AggregateError([error]); let value: unknown = graph;
      if (placement === 'error') value = new Proxy(error, handler);
      if (placement === 'error prototype') Object.setPrototypeOf(error, new Proxy(Error.prototype, handler));
      if (placement === 'ancestor prototype') {
        const prototype = Object.create(new Proxy(Error.prototype, handler)); Object.setPrototypeOf(error, prototype);
      }
      if (placement === 'array') graph.errors = new Proxy([error], handler) as unknown as Error[];
      if (placement === 'array prototype') Object.setPrototypeOf(graph.errors, new Proxy(Array.prototype, handler));
      if (placement === 'child') graph.errors.push(new Proxy(new Error(), handler));
      if (placement === 'revoked') { const item = Proxy.revocable(error, handler); item.revoke(); value = item.proxy; }
      expect(factory()(value, operations[0])).toBe(value); expect(project(value)).toBeNull(); expect(traps).toBe(0);
    });
  it.each(['message', 'stack', 'cause', 'operation', 'errors', 'child', 'prototype'] as const)(
    'rejects %s accessors without invoking them', field => {
      let reads = 0; const error = tagged(); const graph = new AggregateError([error]);
      const descriptor = { configurable: true, get() { reads++; throw new Error('unread'); } };
      if (field === 'child') Object.defineProperty(graph.errors, '0', descriptor);
      else if (field === 'errors') Object.defineProperty(graph, 'errors', descriptor);
      else if (field === 'prototype') { const prototype = Object.create(Error.prototype);
        Object.defineProperty(prototype, 'name', descriptor); Object.setPrototypeOf(error, prototype); }
      else Object.defineProperty(error, field, descriptor);
      expect(project(graph)).toBeNull(); expect(reads).toBe(0);
    });
  it('does not infer phase from message, caller fields or cause', () => {
    const error = primary(); Object.assign(error, { revalidationOperation: operations[0], cause: tagged() });
    error.message = operations[0]; expect(project(error)).toBeNull();
  });
});

function replacement(field: string): unknown {
  if (field.endsWith('Established') || field === 'rawCausePublished') return true;
  if (field === 'version') return 2;
  if (field === 'cycle') return 'cycle-2';
  if (field === 'step') return 'source-lock';
  if (field === 'committedReserveStage') return 'operational-sign';
  if (field === 'committedReserveKind') return 'genesis';
  if (field === 'expectedBridgeCommit') return 'e'.repeat(40);
  return field.endsWith('Hex') ? 'e'.repeat(64) : 'unsupported';
}
const sample = fixture();
describe('prospective revalidation operation companions', () => {
  describe.each(['cycle-1', 'cycle-2'] as const)('%s', cycle => {
    describe.each(['genesis', 'continuation'] as const)('%s', kind => {
      it.each(operations)('roundtrips %s with full old ancestry and unchanged old bytes', operation => {
        const f = fixture(operation, cycle, kind);
        const oldBytes = [f.failure, f.root, f.step, f.stageWorker, f.stageParent, f.originWorker, f.originParent].map(text);
        expect(parseWorker(text(f.worker), bindings, f.lineage)).toEqual(f.worker);
        expect(parseParent(text(f.parent), bindings, terminal, f.lineage)).toEqual(f.parent);
        expect(f.worker).toMatchObject({ cycle, committedReserveKind: kind, revalidationOperation: operation,
          revalidationOrigin: 'revalidator-call', workerRevalidationReceiptDigestHex: f.originWorker.receiptDigestHex,
          operationCompletionEstablished: false, rootCleanupEstablished: false, rawCausePublished: false });
        expect(f.parent).toMatchObject({ parentRevalidationReceiptDigestHex: f.originParent.receiptDigestHex,
          workerRevalidationOperationReceiptDigestHex: f.worker.receiptDigestHex, failureReceiptDigestHex: terminal });
        expect(Object.isFrozen(f.worker)).toBe(true); expect(Object.isFrozen(f.parent)).toBe(true);
        expect([f.failure, f.root, f.step, f.stageWorker, f.stageParent, f.originWorker, f.originParent].map(text)).toEqual(oldBytes);
        expect(text(f.parent)).not.toMatch(/opaque|message|stack|height|budget|invocation|token/i);
      });
    });
  });
  describe.each(['worker', 'parent'] as const)('%s', surface => {
    const fields = Object.keys(sample[surface]);
    const domain = surface === 'worker' ? workerDomain : parentDomain;
    const parse = (value: string, f = sample) => surface === 'worker'
      ? parseWorker(value, bindings, f.lineage) : parseParent(value, bindings, terminal, f.lineage);
    it.each(fields)('rejects independently changed %s after rehash', field => {
      const changed = { ...sample[surface], [field]: replacement(field) };
      expect(() => parse(text(field === 'receiptDigestHex' ? changed : resign(changed, domain)))).toThrow();
    });
    it.each(fields)('rejects independently wrong-type %s after rehash', field => {
      const changed = { ...sample[surface], [field]: null };
      expect(() => parse(text(field === 'receiptDigestHex' ? changed : resign(changed, domain)))).toThrow();
    });
    it.each(fields)('rejects missing %s', field => {
      const changed: Record<string, unknown> = { ...sample[surface] }; delete changed[field];
      expect(() => parse(text(changed))).toThrow();
    });
    it.each(['extra', 'duplicate', 'escaped duplicate', 'whitespace', 'no LF', 'CRLF', 'two LF',
      'invalid JSON', 'null', 'array', 'wrong domain', 'old domain', 'no domain'] as const)('refuses %s', fault => {
      let candidate = text(sample[surface]);
      if (fault === 'extra') candidate = text(resign({ ...sample[surface], rawCause: 'opaque' }, domain));
      if (fault === 'duplicate') candidate = candidate.replace('{', '{"version":1,');
      if (fault === 'escaped duplicate') candidate = candidate.replace('{', '{"ver\\u0073ion":1,');
      if (fault === 'whitespace') candidate = ` ${candidate}`;
      if (fault === 'no LF') candidate = candidate.trimEnd();
      if (fault === 'CRLF') candidate = `${candidate.trimEnd()}\r\n`;
      if (fault === 'two LF') candidate += '\n';
      if (fault === 'invalid JSON') candidate = '{\n';
      if (fault === 'null') candidate = 'null\n';
      if (fault === 'array') candidate = '[]\n';
      if (fault === 'wrong domain') candidate = text(resign(sample[surface], surface === 'worker' ? parentDomain : workerDomain));
      if (fault === 'old domain') candidate = text(resign(sample[surface], domain.replace('_OPERATION_V1', '_V1')));
      if (fault === 'no domain') candidate = text(resign(sample[surface], ''));
      expect(() => parse(candidate)).toThrow();
    });
    it('refuses over-16KiB UTF-8 bytes before invoking the JSON scanner', () => {
      const scan = vi.spyOn(json, 'assertNoDuplicateJsonKeys');
      try { expect(() => parse('é'.repeat(8193))).toThrow(/bound/); expect(scan).not.toHaveBeenCalled(); }
      finally { scan.mockRestore(); }
    });
    it.each([undefined, null, 1, {}, new String('text')])('refuses non-string wire %#', value => {
      expect(() => parse(value as string)).toThrow();
    });
  });
  it.each(Object.keys(sample.lineage) as (keyof typeof sample.lineage)[])(
    'requires exact fully parsed ancestor %s', field => {
      const other = fixture(operations[1], 'cycle-2', 'genesis');
      const alternate = field === 'workerFailureText'
        ? text(createNativeTwoCycleWorkerFailureDiagnosticV1(bindings, 'pre-root', new Error())) : other.lineage[field];
      expect(() => createParent(bindings, terminal, { ...sample.lineage, [field]: alternate })).toThrow();
      expect(() => createParent(bindings, terminal, { ...sample.lineage, [field]: '{\n' })).toThrow();
    });
  it.each(Object.keys(bindings) as (keyof typeof bindings)[])('binds exact %s', field => {
    const changed = { ...bindings, [field]: replacement(field) } as typeof bindings;
    expect(() => parseWorker(text(sample.worker), changed, sample.lineage)).toThrow();
    expect(() => parseParent(text(sample.parent), changed, terminal, sample.lineage)).toThrow();
  });
  it('requires exact terminal and cannot upgrade callback guard origin', () => {
    expect(() => createParent(bindings, 'e'.repeat(64), sample.lineage)).toThrow();
    const callback = fixture(operations[0], 'cycle-1', 'continuation', 'callback-observation-guard');
    expect(() => createWorker(bindings, callback.workerLineage, operations[0])).toThrow(/revalidator-call/);
    expect(() => createParent(bindings, terminal, { ...callback.lineage,
      workerRevalidationOperationText: text(sample.worker) })).toThrow();
  });
  it('worker phase asserts closed self-consistency; parent binds exact asserted worker phase', () => {
    const changed = resign({ ...sample.worker, revalidationOperation: operations[1] }, workerDomain);
    expect(parseWorker(text(changed), bindings, sample.lineage).revalidationOperation).toBe(operations[1]);
    expect(() => parseParent(text(sample.parent), bindings, terminal,
      { ...sample.lineage, workerRevalidationOperationText: text(changed) })).toThrow();
    expect(() => parseParent(text(resign({ ...sample.parent, revalidationOperation: operations[1] }, parentDomain)),
      bindings, terminal, sample.lineage)).toThrow();
  });
  it.each([undefined, null, 1, {}, '', 'unsupported'])('rejects created unsupported operation %#', operation => {
    expect(() => createWorker(bindings, sample.lineage, operation as Operation)).toThrow();
  });
  it('does not accept old companions as new operation companions', () => {
    expect(() => parseWorker(text(sample.originWorker), bindings, sample.lineage)).toThrow();
    expect(() => parseParent(text(sample.originParent), bindings, terminal, sample.lineage)).toThrow();
  });
  it.each(['bindings', 'lineage'] as const)('refuses %s getters/proxies without consultation', surface => {
    let consulted = 0;
    const original = surface === 'bindings' ? bindings : sample.lineage;
    const field = Object.keys(original)[0]!;
    const accessor = { ...original }; Object.defineProperty(accessor, field, { get() { consulted++; throw new Error(); } });
    const proxy = new Proxy(original, { ownKeys() { consulted++; throw new Error(); },
      getPrototypeOf() { consulted++; throw new Error(); }, get() { consulted++; throw new Error(); } });
    for (const hostile of [accessor, proxy]) {
      expect(() => createParent(surface === 'bindings' ? hostile as typeof bindings : bindings,
        terminal, surface === 'lineage' ? hostile as typeof sample.lineage : sample.lineage)).toThrow();
    }
    expect(consulted).toBe(0);
  });
});
