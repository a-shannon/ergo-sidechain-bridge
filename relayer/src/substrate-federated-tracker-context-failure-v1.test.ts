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
