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
  createNativeTwoCycleWorkerCommittedReserveStageV1,
  createNativeTwoCycleParentCommittedReserveStageV1,
} from './substrate-federated-native-committed-reserve-failure-v1.js';
import {
  tagNativeCommittedReserveConfirmationOriginV1 as originTag,
  projectNativeCommittedReserveConfirmationOriginV1 as originProject,
  createNativeTwoCycleWorkerCommittedReserveConfirmationV1,
  createNativeTwoCycleParentCommittedReserveConfirmationV1,
} from './substrate-federated-native-committed-reserve-confirmation-v1.js';
import {
  tagNativeCommittedReserveConfirmationProgressV1 as tag,
  projectNativeCommittedReserveConfirmationProgressV1 as project,
  createNativeTwoCycleWorkerCommittedReserveConfirmationProgressV1 as createWorker,
  parseNativeTwoCycleWorkerCommittedReserveConfirmationProgressV1 as parseWorker,
  createNativeTwoCycleParentCommittedReserveConfirmationProgressV1 as createParent,
  parseNativeTwoCycleParentCommittedReserveConfirmationProgressV1 as parseParent,
  type NativeCommittedReserveConfirmationProgressDetailV1 as Detail,
} from './substrate-federated-native-committed-reserve-confirmation-progress-v1.js';

const bindings = { configSha256Hex: 'a'.repeat(64), expectedBridgeCommit: 'b'.repeat(40),
  pathIdentityDigestHex: 'c'.repeat(64) };
const terminal = 'd'.repeat(64);
const text = (value: unknown) => `${canonicalJson(value)}\n`;
const workerDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_COMMITTED_RESERVE_CONFIRMATION_PROGRESS_V1';
const parentDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_COMMITTED_RESERVE_CONFIRMATION_PROGRESS_V1';
const progressDomain = 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CONFIRMATION_PROGRESS_V1';
const oldWorkerDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_COMMITTED_RESERVE_CONFIRMATION_V1';
const oldParentDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_COMMITTED_RESERVE_CONFIRMATION_V1';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function resign(value: object, domain: string, digestKey = 'receiptDigestHex') {
  const record = { ...value } as Record<string, unknown>;
  delete record[digestKey];
  return { ...record, [digestKey]: sha256CanonicalJson(record, domain) };
}
function progressDetail(): Detail {
  const node = { fullHeightBefore: 10, fullHeightAfter: 12,
    index: { status: 'observed' as const, indexedHeight: 10, fullHeight: 11 },
    pool: { status: 'not_found' as const } };
  const body = { schema: 'e2s.substrate-federated-isolated-devnet-confirmation-progress.v1' as const,
    version: 1 as const, expectedErgoTransactionIdHex: '1'.repeat(64),
    executionTargetIdentityDigestHex: '2'.repeat(64), targetGenesisHeaderIdHex: '3'.repeat(64),
    observationSequence: 2, observedAtUnixMs: 1000, primary: node,
    witness: { ...clone(node), fullHeightAfter: 13 } };
  return { confirmationCategory: 'not_found_at_deadline',
    progress: { ...body, diagnosticDigestHex: sha256CanonicalJson(body, progressDomain) },
    expectedTransactionIdHex: body.expectedErgoTransactionIdHex,
    executionTargetIdentityDigestHex: body.executionTargetIdentityDigestHex,
    targetGenesisHeaderIdHex: body.targetGenesisHeaderIdHex, observationCount: 2,
    lastObservationDigestHex: '4'.repeat(64), lastObservationHeight: 12 };
}
function primary(cycle: 'cycle-1' | 'cycle-2' = 'cycle-1',
  kind: 'genesis' | 'continuation' = 'continuation') {
  return originTag(stepTag(rootTag(stageTag(new Error('opaque'), 'confirmation', kind), cycle),
    cycle, 'committed-reserve'), 'confirmation-observation', 'not_found_at_deadline');
}
function fixture(cycle: 'cycle-1' | 'cycle-2' = 'cycle-1',
  kind: 'genesis' | 'continuation' = 'continuation') {
  const failure = createNativeTwoCycleWorkerFailureDiagnosticV1(bindings, 'root-or-cleanup', new Error());
  const root = createNativeTwoCycleWorkerRootPhaseV2(bindings,
    { primaryPhase: cycle, cleanupErrorCount: 0, ergoNodeStartupPhase: null });
  const step = createNativeTwoCycleWorkerCycleStepV1(bindings, text(failure), text(root),
    { cycle, step: 'committed-reserve' });
  const parentStep = createNativeTwoCycleParentCycleStepV1(bindings, terminal,
    text(failure), text(root), text(step));
  const stage = createNativeTwoCycleWorkerCommittedReserveStageV1(bindings,
    text(failure), text(root), text(step), 'confirmation', kind);
  const parentStage = createNativeTwoCycleParentCommittedReserveStageV1(bindings, terminal,
    text(failure), text(root), text(step), text(stage), text(parentStep));
  const workerLineage = { workerFailureText: text(failure), workerRootPhaseV2Text: text(root),
    workerCycleStepText: text(step), workerCommittedReserveStageText: text(stage) };
  const oldWorker = createNativeTwoCycleWorkerCommittedReserveConfirmationV1(bindings, workerLineage,
    { confirmationOrigin: 'confirmation-observation', confirmationCategory: 'not_found_at_deadline' });
  const confirmationLineage = { ...workerLineage, workerConfirmationText: text(oldWorker),
    parentCycleStepText: text(parentStep), parentCommittedReserveStageText: text(parentStage) };
  const oldParent = createNativeTwoCycleParentCommittedReserveConfirmationV1(bindings, terminal,
    confirmationLineage);
  const detail = progressDetail();
  const worker = createWorker(bindings, confirmationLineage, detail);
  const lineage = { ...confirmationLineage, workerProgressText: text(worker),
    parentConfirmationText: text(oldParent) };
  const parent = createParent(bindings, terminal, lineage);
  return { detail, oldWorker, oldParent, worker, parent, lineage };
}

describe('invocation-local confirmation progress projection', () => {
  describe.each(['cycle-1', 'cycle-2'] as const)('%s', cycle => {
    it.each(['genesis', 'continuation'] as const)('preserves and projects the native %s primary', kind => {
      const error = primary(cycle, kind);
      const keys = Reflect.ownKeys(error);
      const supplied = progressDetail();
      expect(tag(error, supplied)).toBe(error);
      expect(Reflect.ownKeys(error)).toEqual(keys);
      expect(project(error)).toEqual(supplied);
      expect(Object.isFrozen(project(error))).toBe(true);
      expect(Object.isFrozen(project(error)!.progress.primary.index)).toBe(true);
      expect(project(new AggregateError([error, rootTag(new Error(), 'cleanup')]))).toEqual(supplied);
      expect(project(new AggregateError([error, error]))).toEqual(supplied);
      // A validated snapshot cannot be changed through caller-owned data.
      Object.assign(supplied.progress.primary.index, { indexedHeight: 0 });
      expect(project(error)!.progress.primary.index).toMatchObject({ indexedHeight: 10 });
    });
  });
  it.each([undefined, null, 1, 'opaque', {}, Object.create(Error.prototype), new Error()])(
    'refuses synthetic or untagged value %# without replacing it', value => {
      expect(tag(value, progressDetail())).toBe(value);
      expect(project(value)).toBeNull();
    });
  it('refuses clones and caller properties instead of borrowing private metadata', () => {
    const original = tag(primary(), progressDetail());
    expect(project(Object.assign(new Error(), original))).toBeNull();
    const forged = primary(); Object.assign(forged, { confirmationProgress: progressDetail(), cause: original });
    expect(project(forged)).toBeNull();
  });
  it.each([Object.freeze, Object.preventExtensions])('allows sealed native primaries %#', seal => {
    const error = seal(primary()); tag(error, progressDetail());
    expect(project(error)).toEqual(progressDetail());
  });
  it.each(['root', 'step', 'stage', 'kind', 'origin'] as const)(
    'requires own legacy %s metadata', missing => {
      const error = new Error();
      if (missing !== 'stage') stageTag(error, 'confirmation', missing === 'kind' ? undefined : 'continuation');
      if (missing !== 'root') rootTag(error, 'cycle-1');
      if (missing !== 'step') stepTag(error, 'cycle-1', 'committed-reserve');
      if (missing !== 'origin') originTag(error, 'confirmation-observation', 'not_found_at_deadline');
      tag(error, progressDetail()); expect(project(error)).toBeNull();
    });
  it.each(['active-guard', 'nonconfirmation', 'cleanup-only', 'cleanup ancestor', 'cleanup sibling',
    'two primaries', 'foreign tagged sibling', 'conflict', 'conflicted sibling', 'masked aggregate',
    'cycle', 'primitive tail', 'getter errors', 'sparse'] as const)('refuses %s', fault => {
    const error = tag(primary(), progressDetail());
    let candidate: unknown = error;
    if (fault === 'active-guard') {
      const active = stepTag(rootTag(stageTag(new Error(), 'confirmation', 'continuation'), 'cycle-1'),
        'cycle-1', 'committed-reserve');
      candidate = tag(originTag(active, 'active-guard'), progressDetail());
    }
    if (fault === 'nonconfirmation') stageTag(error, 'operational-sign', 'continuation');
    if (fault === 'cleanup-only') candidate = tag(rootTag(new Error(), 'cleanup'), progressDetail());
    if (fault === 'cleanup ancestor') candidate = rootTag(new AggregateError([error]), 'cleanup');
    if (fault === 'cleanup sibling') candidate = new AggregateError([
      error, tag(rootTag(new Error(), 'cleanup'), progressDetail()),
    ]);
    if (fault === 'two primaries') candidate = new AggregateError([error, tag(primary(), progressDetail())]);
    if (fault === 'foreign tagged sibling') candidate = new AggregateError([error, tag(new Error(), progressDetail())]);
    if (fault === 'conflict') tag(error, { ...progressDetail(), lastObservationDigestHex: '5'.repeat(64) });
    if (fault === 'conflicted sibling') {
      const sibling = tag(new Error(), progressDetail()); tag(sibling, {} as Detail);
      candidate = new AggregateError([error, sibling]);
    }
    if (fault === 'masked aggregate') {
      const masked = new AggregateError(['opaque']); Object.setPrototypeOf(masked, Error.prototype);
      candidate = tag(originTag(stepTag(rootTag(stageTag(masked, 'confirmation', 'continuation'),
        'cycle-1'), 'cycle-1', 'committed-reserve'), 'confirmation-observation', 'observer_failure'), progressDetail());
    }
    if (fault === 'cycle') { const graph = new AggregateError([error]); graph.errors.push(graph); candidate = graph; }
    if (fault === 'primitive tail') candidate = new AggregateError([error, 'opaque']);
    if (fault === 'getter errors') {
      const graph = new AggregateError([error]); Object.defineProperty(graph, 'errors', { get() { throw new Error(); } });
      candidate = graph;
    }
    if (fault === 'sparse') { const graph = new AggregateError([error]); graph.errors.length = 2; candidate = graph; }
    expect(project(candidate)).toBeNull();
  });
  it('enforces the 64 inspected-value bound', () => {
    const graph = new AggregateError([tag(primary(), progressDetail()),
      ...Array.from({ length: 62 }, () => new Error())]);
    expect(project(graph)).toEqual(progressDetail());
    graph.errors.push(new Error()); expect(project(graph)).toBeNull();
  });
  it('does not execute error getters or proxy traps', () => {
    let reads = 0;
    const handler = { get() { reads++; throw new Error(); },
      ownKeys() { reads++; throw new Error(); }, getPrototypeOf() { reads++; throw new Error(); },
      getOwnPropertyDescriptor() { reads++; throw new Error(); } };
    const proxy = new Proxy(new Error(), handler);
    expect(tag(proxy, progressDetail())).toBe(proxy); expect(project(proxy)).toBeNull();
    const revoked = Proxy.revocable(new Error(), handler); revoked.revoke();
    expect(tag(revoked.proxy, progressDetail())).toBe(revoked.proxy);
    expect(project(revoked.proxy)).toBeNull();
    const error = tag(primary(), progressDetail());
    for (const key of ['message', 'stack', 'cause', 'confirmationProgress']) {
      Object.defineProperty(error, key, { get() { reads++; throw new Error(); } });
    }
    expect(project(error)).toEqual(progressDetail());
    const graph = new AggregateError([error]);
    graph.errors = new Proxy([error], handler); expect(project(graph)).toBeNull();
    Object.setPrototypeOf(error, new Proxy(Error.prototype, handler)); expect(project(error)).toBeNull();
    expect(reads).toBe(0);
  });
  it('leaves old confirmation projection unchanged after progress conflicts', () => {
    const error = tag(primary(), {} as Detail);
    expect(project(error)).toBeNull();
    expect(originProject(error)).toEqual({ confirmationOrigin: 'confirmation-observation',
      confirmationCategory: 'not_found_at_deadline' });
    tag(error, progressDetail()); expect(project(error)).toBeNull();
  });
  it('permits a fully tagged native aggregate primary and its separate cleanup wrapper', () => {
    const error = originTag(stepTag(rootTag(stageTag(new AggregateError([new Error()]),
      'confirmation', 'genesis'), 'cycle-2'), 'cycle-2', 'committed-reserve'),
    'confirmation-observation', 'not_found_at_deadline');
    expect(tag(error, progressDetail())).toBe(error);
    expect(project(error)).toEqual(progressDetail());
    expect(project(new AggregateError([error, rootTag(new AggregateError([new Error()]), 'cleanup')])))
      .toEqual(progressDetail());
  });
});

type Mutable = Record<string, any>;
const detailFaults: readonly [string, (detail: Mutable) => void][] = [
  ['different valid category', d => { d.confirmationCategory = 'observer_failure'; }],
  ['unknown category', d => { d.confirmationCategory = 'unknown'; }],
  ['stale sequence', d => { d.observationCount++; }],
  ['zero count', d => { d.observationCount = 0; }],
  ['foreign transaction', d => { d.progress.expectedErgoTransactionIdHex = '5'.repeat(64); }],
  ['foreign target', d => { d.progress.executionTargetIdentityDigestHex = '5'.repeat(64); }],
  ['foreign genesis', d => { d.progress.targetGenesisHeaderIdHex = '5'.repeat(64); }],
  ['last height mismatch', d => { d.lastObservationHeight++; }],
  ['last observation digest', d => { d.lastObservationDigestHex = 'A'.repeat(64); }],
  ['expected hex', d => { d.expectedTransactionIdHex = 'x'.repeat(64); }],
  ['progress schema', d => { d.progress.schema = 'unknown'; }],
  ['progress version', d => { d.progress.version = 2; }],
  ['detail unknown field', d => { d.url = 'opaque'; }],
  ['progress unknown field', d => { d.progress.message = 'opaque'; }],
  ['node unknown field', d => { d.progress.primary.message = 'opaque'; }],
  ['pool unknown field', d => { d.progress.primary.pool.body = {}; }],
  ['index unknown field', d => { d.progress.primary.index.url = 'opaque'; }],
  ['negative index', d => { d.progress.primary.index.indexedHeight = -1; }],
  ['index above full', d => { d.progress.primary.index.indexedHeight = 12; }],
  ['index below before', d => { d.progress.primary.index.fullHeight = 9; }],
  ['index above after', d => { d.progress.primary.index.fullHeight = 13; }],
  ['index int32 overflow', d => {
    d.progress.primary.fullHeightAfter = 0x80000000; d.progress.primary.index.fullHeight = 0x80000000;
  }],
  ['regressing node', d => { d.progress.primary.fullHeightAfter = 9; }],
  ['negative node', d => { d.progress.primary.fullHeightBefore = -1; }],
  ['negative time', d => { d.progress.observedAtUnixMs = -1; }],
  ['unavailable unknown reason', d => {
    d.progress.primary.index = { status: 'unavailable', reason: 'unknown', httpStatus: null };
  }],
  ['unavailable http missing status', d => {
    d.progress.primary.index = { status: 'unavailable', reason: 'http_error', httpStatus: null };
  }],
  ['unavailable http out of range', d => {
    d.progress.primary.pool = { status: 'unavailable', reason: 'http_error', httpStatus: 600 };
  }],
  ['unavailable request nonnull status', d => {
    d.progress.primary.pool = { status: 'unavailable', reason: 'request_failed', httpStatus: 404 };
  }],
  ['unavailable response extra field', d => {
    d.progress.primary.index = { status: 'unavailable', reason: 'invalid_response', httpStatus: null, body: {} };
  }],
  ['unknown pool status', d => { d.progress.primary.pool.status = 'confirmed'; }],
];
describe('bounded progress detail', () => {
  it.each(detailFaults)('rejects independently rehashed %s', (_name, mutate) => {
    const f = fixture(); const detail: Mutable = clone(f.detail); mutate(detail);
    detail.progress = resign(detail.progress, progressDomain, 'diagnosticDigestHex');
    const error = primary(); expect(tag(error, detail as Detail)).toBe(error);
    expect(project(error)).toBeNull();
    expect(() => createWorker(bindings, f.lineage, detail as Detail)).toThrow();
    const changed = resign({ ...f.worker, confirmationProgress: detail }, workerDomain);
    expect(() => parseWorker(text(changed), bindings, f.lineage)).toThrow();
  });
  it.each(['primary', 'witness'] as const)('rejects corrupt %s digest coverage', node => {
    const f = fixture(); const detail: Mutable = clone(f.detail);
    detail.progress[node].index.indexedHeight = 9;
    expect(() => createWorker(bindings, f.lineage, detail as Detail)).toThrow();
  });
  it.each(['5'.repeat(64), 'A'.repeat(64), '', 1])('rejects invalid progress checksum %s', digest => {
    const f = fixture(); const detail: Mutable = clone(f.detail);
    detail.progress.diagnosticDigestHex = digest;
    const error = primary(); tag(error, detail as Detail); expect(project(error)).toBeNull();
    expect(() => createWorker(bindings, f.lineage, detail as Detail)).toThrow();
    expect(() => parseWorker(text(resign({ ...f.worker, confirmationProgress: detail }, workerDomain)),
      bindings, f.lineage)).toThrow();
  });
  it.each([NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'refuses non-safe integer metrics %s', value => {
      const f = fixture();
      for (const field of ['observationCount', 'lastObservationHeight']) {
        expect(() => createWorker(bindings, f.lineage, { ...f.detail, [field]: value })).toThrow();
      }
      const detail: Mutable = clone(f.detail); detail.progress.observedAtUnixMs = value;
      expect(() => createWorker(bindings, f.lineage, detail as Detail)).toThrow();
      const badIndex: Mutable = clone(f.detail); badIndex.progress.primary.index.indexedHeight = value;
      expect(() => createWorker(bindings, f.lineage, badIndex as Detail)).toThrow();
      const badNode: Mutable = clone(f.detail); badNode.progress.witness.fullHeightAfter = value;
      expect(() => createWorker(bindings, f.lineage, badNode as Detail)).toThrow();
      expect(() => parseWorker(JSON.stringify({ ...f.worker, confirmationProgress: badIndex }) + '\n',
        bindings, f.lineage)).toThrow();
    });
  it.each(['http_error', 'request_failed', 'invalid_response'] as const)(
    'accepts sanitized unavailable %s without changing failure claims', reason => {
      const f = fixture(); const detail: Mutable = clone(f.detail);
      detail.progress.primary.index = { status: 'unavailable', reason,
        httpStatus: reason === 'http_error' ? 503 : null };
      detail.progress.witness.pool = clone(detail.progress.primary.index);
      detail.progress.primary.pool = { status: 'present' };
      detail.progress = resign(detail.progress, progressDomain, 'diagnosticDigestHex');
      const worker = createWorker(bindings, f.lineage, detail as Detail);
      expect(parseWorker(text(worker), bindings, f.lineage).confirmationProgress).toEqual(detail);
      expect(worker.operationCompletionEstablished).toBe(false);
    });
  it.each(['detail', 'progress', 'node', 'index', 'pool'] as const)(
    'never executes hostile %s descriptors or proxy traps', location => {
      const f = fixture(); let reads = 0;
      for (const fault of ['proxy', 'getter', 'symbol', 'nonenumerable', 'prototype']) {
        const detail: Mutable = clone(f.detail);
        let parent: Mutable; let key: string;
        if (location === 'detail') { parent = { detail }; key = 'detail'; }
        else if (location === 'progress') { parent = detail; key = 'progress'; }
        else if (location === 'node') { parent = detail.progress; key = 'primary'; }
        else { parent = detail.progress.primary; key = location; }
        const record = parent[key];
        if (fault === 'proxy') parent[key] = new Proxy(record, {
          get() { reads++; throw new Error(); }, ownKeys() { reads++; throw new Error(); },
          getPrototypeOf() { reads++; throw new Error(); },
          getOwnPropertyDescriptor() { reads++; throw new Error(); },
        });
        if (fault === 'getter') Object.defineProperty(record, Object.keys(record)[0]!, {
          enumerable: true, get() { reads++; throw new Error(); },
        });
        if (fault === 'symbol') record[Symbol('extra')] = 1;
        if (fault === 'nonenumerable') Object.defineProperty(record, 'opaque', { value: 1 });
        if (fault === 'prototype') Object.setPrototypeOf(record, { extra: 1 });
        const supplied = location === 'detail' ? parent[key] : detail;
        const error = primary(); expect(tag(error, supplied)).toBe(error);
        expect(project(error)).toBeNull();
        expect(() => createWorker(bindings, f.lineage, supplied)).toThrow();
      }
      expect(reads).toBe(0);
    });
});

describe('separate progress receipt lineage', () => {
  describe.each(['cycle-1', 'cycle-2'] as const)('%s', cycle => {
    it.each(['genesis', 'continuation'] as const)('roundtrips %s worker and parent', kind => {
      const f = fixture(cycle, kind);
      expect(parseWorker(text(f.worker), bindings, f.lineage)).toEqual(f.worker);
      expect(parseParent(text(f.parent), bindings, terminal, f.lineage)).toEqual(f.parent);
      expect(f.worker.workerConfirmationReceiptDigestHex).toBe(f.oldWorker.receiptDigestHex);
      expect(f.parent.parentConfirmationReceiptDigestHex).toBe(f.oldParent.receiptDigestHex);
      expect(f.parent.workerProgressReceiptDigestHex).toBe(f.worker.receiptDigestHex);
      for (const receipt of [f.worker, f.parent]) {
        expect(receipt).toMatchObject({ cycle, committedReserveKind: kind,
          confirmationOrigin: 'confirmation-observation', confirmationCategory: 'not_found_at_deadline',
          operationCompletionEstablished: false, rootCleanupEstablished: false, rawCausePublished: false });
        expect(Buffer.byteLength(text(receipt))).toBeLessThan(16 * 1024);
        expect(Object.isFrozen(receipt)).toBe(true);
      }
    });
  });
  it.each(['worker', 'parent'] as const)('rejects canonical, duplicate and bounded text faults: %s', side => {
    const f = fixture(); const receipt = f[side]; const serialized = text(receipt);
    const parse = (value: string) => side === 'worker' ? parseWorker(value, bindings, f.lineage)
      : parseParent(value, bindings, terminal, f.lineage);
    expect(() => parse(serialized.slice(0, -1))).toThrow();
    expect(() => parse(`${serialized}\n`)).toThrow();
    expect(() => parse(JSON.stringify(receipt, null, 2) + '\n')).toThrow();
    expect(() => parse(`{"version":1,${serialized.slice(1)}`)).toThrow();
    expect(() => parse(serialized.replace('"observationCount":2',
      '"observationCount":2,"observationCount":2'))).toThrow();
    expect(() => parse(' '.repeat(16 * 1024 + 1))).toThrow();
    expect(() => parse('{invalid}\n')).toThrow();
    expect(() => parse(text([]))).toThrow();
    expect(() => parse(text(null))).toThrow();
  });
  const faults: readonly [string, unknown][] = [
    ['schema', 'unknown'], ['version', 2], ['status', 'success'], ['configSha256Hex', '5'.repeat(64)],
    ['expectedBridgeCommit', '5'.repeat(40)], ['pathIdentityDigestHex', '5'.repeat(64)],
    ['workerFailureReceiptDigestHex', '5'.repeat(64)], ['workerRootPhaseV2ReceiptDigestHex', '5'.repeat(64)],
    ['workerCycleStepReceiptDigestHex', '5'.repeat(64)], ['workerCommittedReserveStageReceiptDigestHex', '5'.repeat(64)],
    ['workerConfirmationReceiptDigestHex', '5'.repeat(64)], ['cycle', 'cycle-2'], ['step', 'tracker-check'],
    ['committedReserveStage', 'operational-sign'], ['committedReserveKind', 'genesis'],
    ['confirmationOrigin', 'active-guard'], ['confirmationCategory', 'observer_failure'],
    ['operationCompletionEstablished', true], ['rootCleanupEstablished', true], ['rawCausePublished', true],
    ['unknown', 1],
  ];
  it.each(faults)('rejects rehashed worker/parent %s mutation', (key, value) => {
    const f = fixture();
    expect(() => parseWorker(text(resign({ ...f.worker, [key]: value }, workerDomain)), bindings, f.lineage)).toThrow();
    expect(() => parseParent(text(resign({ ...f.parent, [key]: value }, parentDomain)), bindings, terminal, f.lineage)).toThrow();
  });
  it.each(['failureReceiptDigestHex', 'parentCycleStepReceiptDigestHex',
    'parentCommittedReserveStageReceiptDigestHex', 'parentConfirmationReceiptDigestHex',
    'workerProgressReceiptDigestHex'])('rejects rehashed parent %s mutation', key => {
      const f = fixture();
      expect(() => parseParent(text(resign({ ...f.parent, [key]: '5'.repeat(64) }, parentDomain)),
        bindings, terminal, f.lineage)).toThrow();
    });
  it('rejects wrong domains and missing fields even when self-consistently hashed', () => {
    const f = fixture();
    expect(() => parseWorker(text(resign(f.worker, parentDomain)), bindings, f.lineage)).toThrow();
    expect(() => parseParent(text(resign(f.parent, workerDomain)), bindings, terminal, f.lineage)).toThrow();
    for (const key of Object.keys(f.worker)) {
      const candidate: Mutable = { ...f.worker }; delete candidate[key];
      expect(() => parseWorker(text(candidate), bindings, f.lineage), key).toThrow();
    }
    for (const key of Object.keys(f.parent)) {
      const candidate: Mutable = { ...f.parent }; delete candidate[key];
      expect(() => parseParent(text(candidate), bindings, terminal, f.lineage), key).toThrow();
    }
  });
  it.each(['configSha256Hex', 'expectedBridgeCommit', 'pathIdentityDigestHex'] as const)(
    'requires caller %s binding', key => {
      const f = fixture(); const changed = { ...bindings, [key]: '5'.repeat(bindings[key].length) };
      expect(() => parseWorker(text(f.worker), changed, f.lineage)).toThrow();
      expect(() => parseParent(text(f.parent), changed, terminal, f.lineage)).toThrow();
    });
  it.each(['workerFailureText', 'workerRootPhaseV2Text', 'workerCycleStepText',
    'workerCommittedReserveStageText', 'workerConfirmationText', 'parentCycleStepText',
    'parentCommittedReserveStageText', 'parentConfirmationText', 'workerProgressText'] as const)(
    'fully validates %s instead of trusting its claimed digest', key => {
      const f = fixture(); const changed = { ...f.lineage, [key]: text({}) };
      expect(() => createParent(bindings, terminal, changed)).toThrow();
      if (key.startsWith('worker') && key !== 'workerProgressText') {
        expect(() => createWorker(bindings, changed, f.detail)).toThrow();
      }
    });
  it.each(['cycle', 'kind'] as const)('rejects a valid foreign worker %s ancestry', fault => {
    const f = fixture(); const foreign = fault === 'cycle' ? fixture('cycle-2') : fixture('cycle-1', 'genesis');
    expect(() => createParent(bindings, terminal, { ...f.lineage,
      workerProgressText: text(foreign.worker) })).toThrow();
  });
  it('rejects different valid confirmation categories across parent and worker', () => {
    const f = fixture();
    const changedOld = resign({ ...f.oldWorker, confirmationCategory: 'observer_failure' }, oldWorkerDomain);
    const changedLineage = { ...f.lineage, workerConfirmationText: text(changedOld) };
    const worker = createWorker(bindings, changedLineage, { ...f.detail, confirmationCategory: 'observer_failure' });
    expect(() => createParent(bindings, terminal, { ...changedLineage,
      workerProgressText: text(worker) })).toThrow();
  });
  it('refuses an old active-guard receipt and a parent with false legacy equivalence', () => {
    const f = fixture();
    const active = resign({ ...f.oldWorker, confirmationOrigin: 'active-guard', confirmationCategory: null }, oldWorkerDomain);
    expect(() => createWorker(bindings, { ...f.lineage, workerConfirmationText: text(active) }, f.detail)).toThrow();
    const forgedParent = resign({ ...f.oldParent, rawCausePublished: true }, oldParentDomain);
    expect(() => createParent(bindings, terminal, { ...f.lineage,
      parentConfirmationText: text(forgedParent) })).toThrow();
    expect(() => createParent(bindings, '5'.repeat(64), f.lineage)).toThrow();
  });
  it('binds changed validated progress to the new parent receipt', () => {
    const f = fixture(); const detail: Mutable = clone(f.detail);
    detail.progress.primary.pool = { status: 'present' };
    detail.progress = resign(detail.progress, progressDomain, 'diagnosticDigestHex');
    const worker = createWorker(bindings, f.lineage, detail as Detail);
    const changed = { ...f.lineage, workerProgressText: text(worker) };
    const parent = createParent(bindings, terminal, changed);
    expect(parent.workerProgressReceiptDigestHex).not.toBe(f.parent.workerProgressReceiptDigestHex);
    expect(parent.parentConfirmationReceiptDigestHex).toBe(f.parent.parentConfirmationReceiptDigestHex);
    expect(() => parseParent(text(f.parent), bindings, terminal, changed)).toThrow();
  });
});
