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
  SUBSTRATE_FEDERATED_TRACKER_V2_BUILD_FAILURE_PHASES_V1 as phases,
  tagSubstrateFederatedTrackerV2BuildFailurePhaseV1 as tag,
  projectOwnSubstrateFederatedTrackerV2BuildFailurePhaseV1 as own,
  projectSubstrateFederatedTrackerV2BuildFailurePhaseV1 as project,
  createNativeTwoCycleWorkerTrackerContextV1 as createWorker,
  parseNativeTwoCycleWorkerTrackerContextV1 as parseWorker,
  createNativeTwoCycleParentTrackerContextV1 as createParent,
  parseNativeTwoCycleParentTrackerContextV1 as parseParent,
  type SubstrateFederatedTrackerV2BuildFailurePhaseV1 as Phase,
  SUBSTRATE_FEDERATED_TRACKER_V2_STATEMENT_FAILURE_CHECKS_V1 as checks,
  tagSubstrateFederatedTrackerV2StatementFailureCheckV1 as checkTag,
  projectOwnSubstrateFederatedTrackerV2StatementFailureCheckV1 as ownCheck,
  projectSubstrateFederatedTrackerV2StatementFailureCheckV1 as projectCheck,
  createNativeTwoCycleWorkerTrackerStatementV1 as createStatementWorker,
  parseNativeTwoCycleWorkerTrackerStatementV1 as parseStatementWorker,
  createNativeTwoCycleParentTrackerStatementV1 as createStatementParent,
  parseNativeTwoCycleParentTrackerStatementV1 as parseStatementParent,
  type SubstrateFederatedTrackerV2StatementFailureCheckV1 as Check,
} from './substrate-federated-tracker-context-failure-v1.js';

type Cycle = 'cycle-1' | 'cycle-2';
const bindings = { configSha256Hex: 'a'.repeat(64), expectedBridgeCommit: 'b'.repeat(40),
  pathIdentityDigestHex: 'c'.repeat(64) };
const terminal = 'd'.repeat(64);
const workerDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_TRACKER_CONTEXT_V1';
const parentDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_TRACKER_CONTEXT_V1';
const text = (value: unknown) => `${canonicalJson(value)}\n`;
function primary(phase: Phase = 'statement', cycle: Cycle = 'cycle-1'): Error {
  return stepTag(rootTag(tag(new Error('unpublished cause'), phase), cycle), cycle, 'tracker-context');
}
function fixture(phase: Phase = 'statement', cycle: Cycle = 'cycle-1') {
  const failure = createNativeTwoCycleWorkerFailureDiagnosticV1(bindings,
    'root-or-cleanup', new Error('unpublished cause'));
  const root = createNativeTwoCycleWorkerRootPhaseV2(bindings,
    { primaryPhase: cycle, cleanupErrorCount: 0, ergoNodeStartupPhase: null });
  const step = createNativeTwoCycleWorkerCycleStepV1(bindings, text(failure), text(root),
    { cycle, step: 'tracker-context' });
  const parentStep = createNativeTwoCycleParentCycleStepV1(bindings, terminal,
    text(failure), text(root), text(step));
  const worker = createWorker(bindings, text(failure), text(root), text(step), phase);
  const parent = createParent(bindings, terminal, text(failure), text(root), text(step),
    text(worker), text(parentStep));
  return { failure, root, step, parentStep, worker, parent };
}
type Fixture = ReturnType<typeof fixture>;
function readWorker(candidate: string, f: Fixture) {
  return parseWorker(candidate, bindings, text(f.failure), text(f.root), text(f.step));
}
function readParent(candidate: string, f: Fixture) {
  return parseParent(candidate, bindings, terminal, text(f.failure), text(f.root), text(f.step),
    text(f.worker), text(f.parentStep));
}
function resign(record: Record<string, unknown>, domain: string) {
  const { receiptDigestHex: ignored, ...body } = record; void ignored;
  return { ...body, receiptDigestHex: sha256CanonicalJson(body, domain) };
}

describe('private tracker constructor phase metadata', () => {
  describe.each(['cycle-1', 'cycle-2'] as const)('%s exact producer ancestry', cycle => {
    it.each(phases)('projects %s while preserving native error identity', phase => {
      const error = new Error('opaque');
      Object.defineProperties(error, {
        message: { get() { throw new Error('message must not be read'); } },
        stack: { get() { throw new Error('stack must not be read'); } },
        trackerContextPhase: { get() { throw new Error('caller phase must not be read'); } },
      });
      const keys = Reflect.ownKeys(error);
      expect(tag(error, phase)).toBe(error);
      expect(tag(error, phase)).toBe(error);
      expect(Reflect.ownKeys(error)).toEqual(keys);
      expect(own(error)).toBe(phase);
      expect(project(error)).toBeNull();
      stepTag(rootTag(error, cycle), cycle, 'tracker-context');
      expect(project(error)).toBe(phase);
    });
  });

  it.each([undefined, null, 1, 'statement', {}, { trackerContextPhase: 'statement' },
    Object.create(Error.prototype), new Proxy(new Error(), {}),
    new Proxy({}, { get() { throw new Error('must not read'); } })])(
    'rejects unknown, forged, proxy or non-Error metadata %#', value => {
      expect(tag(value, 'statement')).toBe(value);
      expect(own(value)).toBeNull();
      expect(project(value)).toBeNull();
    });
  it('rejects a revoked proxy without invoking its traps', () => {
    const { proxy, revoke } = Proxy.revocable(new Error(), {}); revoke();
    expect(tag(proxy, 'statement')).toBe(proxy);
    expect(own(proxy)).toBeNull();
    expect(project(proxy)).toBeNull();
  });
  it('does not infer a phase from Error properties or cause', () => {
    const error = Object.assign(new Error('statement'), {
      phase: 'statement', trackerContextPhase: 'statement', cause: primary(),
    });
    stepTag(rootTag(error, 'cycle-1'), 'cycle-1', 'tracker-context');
    expect(own(error)).toBeNull(); expect(project(error)).toBeNull();
  });
  it.each(['different', 'invalid'] as const)('rejects permanent %s phase conflicts', mode => {
    const error = primary();
    tag(error, mode === 'different' ? 'membership' : 'arbitrary' as Phase);
    tag(error, 'statement');
    expect(own(error)).toBeNull(); expect(project(error)).toBeNull();
  });
  it('projects a primary under a cleanup aggregate without borrowing cleanup detail', () => {
    const error = primary();
    const cleanup = rootTag(new Error('opaque'), 'cleanup');
    expect(project(new AggregateError([error, cleanup]))).toBe('statement');
  });
  it.each(['phase conflict', 'two producers', 'cleanup tag', 'borrowed cycle', 'borrowed step',
    'wrong step', 'wrong cycle', 'cycle graph', 'unknown child', 'sparse children', 'getter child',
    'getter errors', 'proxy children', 'custom iterator', 'over bound', 'shared cleanup'] as const)(
    'rejects aggregate or ancestry fault: %s', fault => {
      const error = primary();
      let graph: unknown = new AggregateError([error]);
      const aggregate = graph as AggregateError;
      if (fault === 'phase conflict') tag(error, 'membership');
      if (fault === 'two producers') aggregate.errors.push(primary());
      if (fault === 'cleanup tag') graph = new AggregateError([
        error, rootTag(tag(new Error(), 'statement'), 'cleanup'),
      ]);
      if (fault === 'borrowed cycle') {
        const child = tag(new Error(), 'statement');
        stepTag(child, 'cycle-1', 'tracker-context');
        graph = rootTag(new AggregateError([child]), 'cycle-1');
      }
      if (fault === 'borrowed step') {
        const child = rootTag(tag(new Error(), 'statement'), 'cycle-1');
        graph = stepTag(rootTag(new AggregateError([child]), 'cycle-1'), 'cycle-1', 'tracker-context');
      }
      if (fault === 'wrong step') stepTag(error, 'cycle-1', 'tracker-check');
      if (fault === 'wrong cycle') graph = stepTag(
        rootTag(tag(new Error(), 'statement'), 'cycle-2'), 'cycle-1', 'tracker-context',
      );
      if (fault === 'cycle graph') aggregate.errors.push(aggregate);
      if (fault === 'unknown child') aggregate.errors.push('statement');
      if (fault === 'sparse children') aggregate.errors.length = 2;
      if (fault === 'getter child') Object.defineProperty(aggregate.errors, '0', {
        get() { throw new Error('must not read'); },
      });
      if (fault === 'getter errors') Object.defineProperty(aggregate, 'errors', {
        get() { throw new Error('must not read'); },
      });
      if (fault === 'proxy children') aggregate.errors = new Proxy([error], {});
      if (fault === 'custom iterator') aggregate.errors[Symbol.iterator] = function* () {
        throw new Error('must not iterate');
      };
      if (fault === 'over bound') aggregate.errors = [error, ...Array.from({ length: 64 }, () => new Error())];
      if (fault === 'shared cleanup') {
        const shared = new AggregateError([error]);
        graph = new AggregateError([shared, rootTag(new AggregateError([shared]), 'cleanup')]);
      }
      expect(project(graph)).toBeNull();
    });
});

const workerFields = ['schema', 'version', 'status', 'configSha256Hex', 'expectedBridgeCommit',
  'pathIdentityDigestHex', 'workerFailureReceiptDigestHex', 'workerRootPhaseV2ReceiptDigestHex',
  'workerCycleStepReceiptDigestHex', 'cycle', 'step', 'trackerContextPhase',
  'operationCompletionEstablished', 'rootCleanupEstablished', 'rawCausePublished', 'receiptDigestHex'];
const parentFields = [...workerFields, 'failureReceiptDigestHex',
  'workerTrackerContextReceiptDigestHex', 'parentCycleStepReceiptDigestHex'];
const statementWorkerDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_TRACKER_STATEMENT_V1';
const statementParentDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_TRACKER_STATEMENT_V1';
function statementFixture(check: Check = 'decode', cycle: Cycle = 'cycle-1') {
  const f = fixture('statement', cycle);
  const statementWorker = createStatementWorker(bindings, text(f.failure), text(f.root), text(f.step),
    text(f.worker), check);
  const statementParent = createStatementParent(bindings, terminal, text(f.failure), text(f.root),
    text(f.step), text(f.worker), text(f.parentStep), text(statementWorker), text(f.parent));
  return { ...f, statementWorker, statementParent };
}
type StatementFixture = ReturnType<typeof statementFixture>;
function readStatementWorker(candidate: string, f: StatementFixture) {
  return parseStatementWorker(candidate, bindings, text(f.failure), text(f.root), text(f.step), text(f.worker));
}
function readStatementParent(candidate: string, f: StatementFixture) {
  return parseStatementParent(candidate, bindings, terminal, text(f.failure), text(f.root), text(f.step),
    text(f.worker), text(f.parentStep), text(f.statementWorker), text(f.parent));
}

describe('tracker statement same-producer metadata', () => {
  it.each((['cycle-1', 'cycle-2'] as const).flatMap(cycle => checks.map(check => ({ cycle, check }))))(
    'projects $cycle $check preserving the exact native error', ({ cycle, check }) => {
      const error = primary('statement', cycle);
      Object.defineProperties(error, {
        message: { get() { throw new Error('must not inspect message'); } },
        stack: { get() { throw new Error('must not inspect stack'); } },
        statementCheck: { get() { throw new Error('must not inspect caller check'); } },
      });
      const keys = Reflect.ownKeys(error);
      expect(checkTag(error, check)).toBe(error);
      expect(checkTag(error, check)).toBe(error);
      expect(Reflect.ownKeys(error)).toEqual(keys);
      expect(ownCheck(error)).toBe(check);
      expect(projectCheck(new AggregateError([error, rootTag(new Error(), 'cleanup')]))).toBe(check);
    });
  it.each([undefined, null, 1, 'decode', {}, { statementCheck: 'decode' },
    Object.create(Error.prototype), new Proxy(new Error(), {}),
    new Proxy({}, { get() { throw new Error('must not inspect'); } })])(
    'omits unknown, primitive, forged or proxy %#', value => {
      expect(checkTag(value, 'decode')).toBe(value);
      expect(ownCheck(value)).toBeNull(); expect(projectCheck(value)).toBeNull();
    });
  it('rejects a revoked proxy', () => {
    const { proxy, revoke } = Proxy.revocable(new Error(), {}); revoke();
    expect(checkTag(proxy, 'decode')).toBe(proxy);
    expect(projectCheck(proxy)).toBeNull();
  });
  it.each(['missing check', 'foreign property', 'cause detail', 'unknown check', 'conflicting check',
    'other producer', 'two checks', 'wrong phase', 'missing phase', 'borrowed root', 'borrowed step',
    'wrong cycle', 'wrong step', 'cleanup producer', 'cleanup ancestor', 'shared cleanup',
    'ambiguous phase', 'proxy child', 'primitive child', 'cycle graph', 'sparse children',
    'getter child', 'getter errors', 'proxy children', 'custom iterator', 'over bound'] as const)(
    'omits detail for %s', fault => {
      const error = primary(); checkTag(error, 'decode');
      const aggregate = new AggregateError([error]); let graph: unknown = aggregate;
      if (fault === 'missing check') graph = primary();
      if (fault === 'foreign property') graph = Object.assign(primary(), { statementCheck: 'decode' });
      if (fault === 'cause detail') graph = Object.assign(primary(), { cause: error });
      if (fault === 'unknown check') checkTag(error, 'unknown' as Check);
      if (fault === 'conflicting check') { checkTag(error, 'application-binding'); checkTag(error, 'decode'); }
      if (fault === 'other producer') graph = new AggregateError([primary(), checkTag(new Error(), 'decode')]);
      if (fault === 'two checks') aggregate.errors.push(checkTag(new Error(), 'decode'));
      if (fault === 'wrong phase') graph = checkTag(primary('membership'), 'decode');
      if (fault === 'missing phase') graph = stepTag(rootTag(checkTag(new Error(), 'decode'), 'cycle-1'), 'cycle-1', 'tracker-context');
      if (fault === 'borrowed root') graph = rootTag(new AggregateError([
        stepTag(tag(checkTag(new Error(), 'decode'), 'statement'), 'cycle-1', 'tracker-context'),
      ]), 'cycle-1');
      if (fault === 'borrowed step') graph = stepTag(new AggregateError([
        rootTag(tag(checkTag(new Error(), 'decode'), 'statement'), 'cycle-1'),
      ]), 'cycle-1', 'tracker-context');
      if (fault === 'wrong cycle') graph = stepTag(rootTag(tag(checkTag(new Error(), 'decode'), 'statement'),
        'cycle-2'), 'cycle-1', 'tracker-context');
      if (fault === 'wrong step') stepTag(error, 'cycle-1', 'tracker-check');
      if (fault === 'cleanup producer') aggregate.errors.push(rootTag(checkTag(new Error(), 'decode'), 'cleanup'));
      if (fault === 'cleanup ancestor') graph = rootTag(new AggregateError([error]), 'cleanup');
      if (fault === 'shared cleanup') graph = new AggregateError([aggregate, rootTag(new AggregateError([aggregate]), 'cleanup')]);
      if (fault === 'ambiguous phase') aggregate.errors.push(primary());
      if (fault === 'proxy child') aggregate.errors.push(new Proxy(new Error(), {}));
      if (fault === 'primitive child') aggregate.errors.push('opaque');
      if (fault === 'cycle graph') aggregate.errors.push(aggregate);
      if (fault === 'sparse children') aggregate.errors.length = 2;
      if (fault === 'getter child') Object.defineProperty(aggregate.errors, '0', { get() { throw new Error('must not inspect'); } });
      if (fault === 'getter errors') Object.defineProperty(aggregate, 'errors', { get() { throw new Error('must not inspect'); } });
      if (fault === 'proxy children') aggregate.errors = new Proxy([error], {});
      if (fault === 'custom iterator') aggregate.errors[Symbol.iterator] = function* () { throw new Error('must not iterate'); };
      if (fault === 'over bound') aggregate.errors = [error, ...Array.from({ length: 64 }, () => new Error())];
      expect(projectCheck(graph)).toBeNull();
    });
});

describe('tracker statement versioned companion joins', () => {
  it.each((['cycle-1', 'cycle-2'] as const).flatMap(cycle => checks.map(check => ({ cycle, check }))))(
    'roundtrips synthetic $cycle $check', ({ cycle, check }) => {
      const f = statementFixture(check, cycle);
      expect(readStatementWorker(text(f.statementWorker), f)).toEqual(f.statementWorker);
      expect(readStatementParent(text(f.statementParent), f)).toEqual(f.statementParent);
      expect(f.statementParent).toMatchObject({ cycle, statementCheck: check, trackerContextPhase: 'statement',
        workerTrackerContextReceiptDigestHex: f.worker.receiptDigestHex,
        parentTrackerContextReceiptDigestHex: f.parent.receiptDigestHex,
        workerTrackerStatementReceiptDigestHex: f.statementWorker.receiptDigestHex,
        operationCompletionEstablished: false, rootCleanupEstablished: false, rawCausePublished: false });
      expect(Object.isFrozen(f.statementWorker)).toBe(true); expect(Object.isFrozen(f.statementParent)).toBe(true);
    });
  it.each([...workerFields, 'workerTrackerContextReceiptDigestHex', 'statementCheck'])(
    'rejects independent rehashed worker %s', field => {
      const f = statementFixture(); const candidate = { ...f.statementWorker,
        [field]: field === 'statementCheck' ? 'unknown' : field === 'trackerContextPhase' ? 'membership' : replacement(field) };
      expect(() => readStatementWorker(text(field === 'receiptDigestHex' ? candidate
        : resign(candidate, statementWorkerDomain)), f)).toThrow();
    });
  it.each([...parentFields, 'parentTrackerContextReceiptDigestHex', 'workerTrackerStatementReceiptDigestHex', 'statementCheck'])(
    'rejects independent rehashed parent %s', field => {
      const f = statementFixture(); const candidate = { ...f.statementParent,
        [field]: field === 'statementCheck' ? 'application-binding' : field === 'trackerContextPhase' ? 'membership' : replacement(field) };
      expect(() => readStatementParent(text(field === 'receiptDigestHex' ? candidate
        : resign(candidate, statementParentDomain)), f)).toThrow();
    });
  it.each(['worker', 'parent'] as const)('rejects rehashed coordinated claims and lineage on %s', surface => {
    const f = statementFixture(); const record = surface === 'worker' ? f.statementWorker : f.statementParent;
    const domain = surface === 'worker' ? statementWorkerDomain : statementParentDomain;
    for (const mutation of [{ operationCompletionEstablished: true, rootCleanupEstablished: true, rawCausePublished: true },
      { cycle: 'cycle-2', workerFailureReceiptDigestHex: 'e'.repeat(64), workerRootPhaseV2ReceiptDigestHex: 'e'.repeat(64),
        workerCycleStepReceiptDigestHex: 'e'.repeat(64), workerTrackerContextReceiptDigestHex: 'e'.repeat(64) }]) {
      const candidate = text(resign({ ...record, ...mutation }, domain));
      expect(() => surface === 'worker' ? readStatementWorker(candidate, f) : readStatementParent(candidate, f)).toThrow();
    }
  });
  describe.each(['worker', 'parent'] as const)('%s exact encoding', surface => {
    it.each(['extra', 'missing', 'duplicate', 'escaped duplicate', 'whitespace', 'no newline', 'CRLF',
      'second newline', 'invalid', 'nonobject', 'array', 'unicode bound', 'wrong domain', 'legacy domain'] as const)(
      'rejects %s', mutation => {
        const f = statementFixture(); const record = surface === 'worker' ? f.statementWorker : f.statementParent;
        const domain = surface === 'worker' ? statementWorkerDomain : statementParentDomain;
        const { statementCheck: ignored, ...missing } = record; void ignored;
        let candidate = text(record);
        if (mutation === 'extra') candidate = text(resign({ ...record, rawCause: 'opaque' }, domain));
        if (mutation === 'missing') candidate = text(resign(missing, domain));
        if (mutation === 'duplicate') candidate = candidate.replace('{', '{"version":1,');
        if (mutation === 'escaped duplicate') candidate = candidate.replace('{', '{"ver\\u0073ion":1,');
        if (mutation === 'whitespace') candidate = ` ${candidate}`;
        if (mutation === 'no newline') candidate = candidate.trimEnd();
        if (mutation === 'CRLF') candidate = `${candidate.trimEnd()}\r\n`;
        if (mutation === 'second newline') candidate += '\n';
        if (mutation === 'invalid') candidate = '{\n';
        if (mutation === 'nonobject') candidate = 'null\n';
        if (mutation === 'array') candidate = '[]\n';
        if (mutation === 'unicode bound') candidate = text({ ...record, schema: 'é'.repeat(9_000) });
        if (mutation === 'wrong domain') candidate = text(resign(record, surface === 'worker' ? statementParentDomain : statementWorkerDomain));
        if (mutation === 'legacy domain') candidate = text(resign(record, surface === 'worker' ? workerDomain : parentDomain));
        expect(() => surface === 'worker' ? readStatementWorker(candidate, f) : readStatementParent(candidate, f)).toThrow();
      });
  });
  it.each(['failure', 'root', 'step', 'parentStep', 'worker', 'parent', 'statementWorker'] as const)(
    'rejects exact ancestor substitution %s', ancestor => {
      const f = statementFixture(); const other = statementFixture('application-binding', 'cycle-2');
      const changed = { ...f, [ancestor]: ancestor === 'failure'
        ? createNativeTwoCycleWorkerFailureDiagnosticV1(bindings, 'pre-root', new Error()) : other[ancestor] };
      expect(() => readStatementParent(text(f.statementParent), changed)).toThrow();
    });
  it.each(phases.filter(phase => phase !== 'statement'))('rejects nonstatement context %s', phase => {
    const f = fixture(phase);
    expect(() => createStatementWorker(bindings, text(f.failure), text(f.root), text(f.step), text(f.worker), 'decode')).toThrow();
  });
});
function replacement(field: string): unknown {
  if (field === 'cycle') return 'cycle-2';
  if (field === 'step') return 'tracker-check';
  if (field === 'trackerContextPhase') return 'unknown';
  if (field.endsWith('Hex')) return 'e'.repeat(64);
  if (field === 'expectedBridgeCommit') return 'e'.repeat(40);
  if (field === 'version') return 2;
  if (field.endsWith('Established') || field === 'rawCausePublished') return true;
  return 'foreign';
}

describe('tracker context worker and parent receipt ancestry', () => {
  describe.each(['cycle-1', 'cycle-2'] as const)('%s exact encoding', cycle => {
    it.each(phases)('roundtrips closed phase %s', phase => {
      const f = fixture(phase, cycle);
      expect(readWorker(text(f.worker), f)).toEqual(f.worker);
      expect(readParent(text(f.parent), f)).toEqual(f.parent);
      expect(f.parent).toMatchObject({ cycle, step: 'tracker-context', trackerContextPhase: phase,
        workerTrackerContextReceiptDigestHex: f.worker.receiptDigestHex,
        parentCycleStepReceiptDigestHex: f.parentStep.receiptDigestHex,
        failureReceiptDigestHex: terminal, operationCompletionEstablished: false,
        rootCleanupEstablished: false, rawCausePublished: false });
      expect(Object.isFrozen(f.worker)).toBe(true); expect(Object.isFrozen(f.parent)).toBe(true);
      expect(text(f.parent)).not.toMatch(/unpublished|opaque|message|stack|[A-Za-z]:[\\/]/u);
    });
  });
  it.each(workerFields)('rejects independently changed worker %s after rehash', field => {
    const f = fixture(); const candidate = { ...f.worker, [field]: replacement(field) };
    expect(() => readWorker(text(field === 'receiptDigestHex' ? candidate
      : resign(candidate, workerDomain)), f)).toThrow();
  });
  it.each(parentFields)('rejects independently changed parent %s after rehash', field => {
    const f = fixture(); const candidate = { ...f.parent,
      [field]: field === 'trackerContextPhase' ? 'membership' : replacement(field) };
    expect(() => readParent(text(field === 'receiptDigestHex' ? candidate
      : resign(candidate, parentDomain)), f)).toThrow();
  });
  describe.each(['worker', 'parent'] as const)('%s canonical bounded text', surface => {
    it.each(['extra', 'missing', 'duplicate', 'escaped duplicate', 'whitespace', 'no newline',
      'CRLF', 'second newline', 'invalid', 'nonobject', 'array', 'unicode bound',
      'wrong domain', 'legacy domain', 'unseparated domain'] as const)('rejects %s', mutation => {
      const f = fixture(); const record = surface === 'worker' ? f.worker : f.parent;
      const domain = surface === 'worker' ? workerDomain : parentDomain;
      const { status: ignored, ...missing } = record; void ignored;
      let candidate: string = text(record);
      if (mutation === 'extra') candidate = text(resign({ ...record, rawCause: 'unknown' }, domain));
      if (mutation === 'missing') candidate = text(resign(missing, domain));
      if (mutation === 'duplicate') candidate = candidate.replace('{', '{"version":1,');
      if (mutation === 'escaped duplicate') candidate = candidate.replace('{', '{"ver\\u0073ion":1,');
      if (mutation === 'whitespace') candidate = ` ${candidate}`;
      if (mutation === 'no newline') candidate = candidate.trimEnd();
      if (mutation === 'CRLF') candidate = `${candidate.trimEnd()}\r\n`;
      if (mutation === 'second newline') candidate += '\n';
      if (mutation === 'invalid') candidate = '{\n';
      if (mutation === 'nonobject') candidate = 'null\n';
      if (mutation === 'array') candidate = '[]\n';
      if (mutation === 'unicode bound') candidate = text({ ...record, schema: 'é'.repeat(9_000) });
      if (mutation === 'wrong domain') candidate = text(resign(record,
        surface === 'worker' ? parentDomain : workerDomain));
      if (mutation === 'legacy domain') candidate = text(resign(record,
        'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_CYCLE_STEP_V1'));
      if (mutation === 'unseparated domain') candidate = text(resign(record, ''));
      expect(() => surface === 'worker' ? readWorker(candidate, f) : readParent(candidate, f)).toThrow();
    });
  });
  it.each(['failure', 'root', 'step', 'parentStep', 'worker'] as const)(
    'rejects exact ancestor substitution: %s', ancestor => {
      const f = fixture(); const other = fixture('membership', 'cycle-2');
      const changed = { ...f, [ancestor]: ancestor === 'failure'
        ? createNativeTwoCycleWorkerFailureDiagnosticV1(bindings, 'pre-root', new Error())
        : other[ancestor] };
      expect(() => readParent(text(f.parent), changed)).toThrow();
    });
  it.each(['setup-check', 'tracker-observation', 'tracker-context-custody', 'tracker-check'] as const)(
    'rejects a validated other step: %s', step => {
      const f = fixture();
      const otherStep = createNativeTwoCycleWorkerCycleStepV1(bindings, text(f.failure), text(f.root),
        { cycle: 'cycle-1', step });
      expect(() => createWorker(bindings, text(f.failure), text(f.root), text(otherStep), 'statement')).toThrow();
    });
  it('rejects a changed terminal digest even with unchanged ancestors', () => {
    const f = fixture();
    expect(() => createParent(bindings, 'e'.repeat(64), text(f.failure), text(f.root), text(f.step),
      text(f.worker), text(f.parentStep))).toThrow();
  });
  it('allows a closed worker assertion but never authenticates its producer', () => {
    const f = fixture();
    const changed = resign({ ...f.worker, trackerContextPhase: 'membership' }, workerDomain);
    expect(readWorker(text(changed), f).trackerContextPhase).toBe('membership');
    expect(() => readParent(text(f.parent), { ...f, worker: changed as typeof f.worker })).toThrow();
  });
});
