import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import { tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 as rootTag }
  from './substrate-federated-native-two-cycle-root-phase-v1.js';
import { tagNativeTwoCycleCycleStepFailureV1 as stepTag, NATIVE_TWO_CYCLE_CYCLE_STEPS_V1 }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';
import { tagSubstrateFederatedTrackerV2BuildFailurePhaseV1 as trackerTag,
  projectOwnSubstrateFederatedTrackerV2BuildFailurePhaseV1 as trackerOwn }
  from './substrate-federated-tracker-context-failure-v1.js';
import { createNativeTwoCycleWorkerFailureDiagnosticV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { createNativeTwoCycleWorkerRootPhaseV2 }
  from './substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';
import { createNativeTwoCycleWorkerCycleStepV1, createNativeTwoCycleParentCycleStepV1 }
  from './substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { tagSubstrateFederatedNativeSourceLockFailureStageV1 as sourceLockTag,
  projectOwnSubstrateFederatedNativeSourceLockFailureStageV1 as sourceLockOwn,
  projectSubstrateFederatedNativeSourceLockFailureStageV1 as sourceLockProject }
  from './substrate-federated-native-source-lock-failure-v1.js';
import {
  SUBSTRATE_FEDERATED_NATIVE_COMMITTED_RESERVE_FAILURE_STAGES_V1 as stages,
  tagSubstrateFederatedNativeCommittedReserveFailureStageV1 as tag,
  projectOwnSubstrateFederatedNativeCommittedReserveFailureStageV1 as own,
  projectOwnSubstrateFederatedNativeCommittedReserveKindV1 as ownKind,
  projectSubstrateFederatedNativeCommittedReserveFailureStageV1 as project,
  createNativeTwoCycleWorkerCommittedReserveStageV1 as createWorker,
  parseNativeTwoCycleWorkerCommittedReserveStageV1 as parseWorker,
  createNativeTwoCycleParentCommittedReserveStageV1 as createParent,
  parseNativeTwoCycleParentCommittedReserveStageV1 as parseParent,
  type SubstrateFederatedNativeCommittedReserveFailureStageV1 as Stage,
  type SubstrateFederatedNativeCommittedReserveKindV1 as Kind,
} from './substrate-federated-native-committed-reserve-failure-v1.js';

type Cycle = 'cycle-1' | 'cycle-2';
const bindings = { configSha256Hex: 'a'.repeat(64), expectedBridgeCommit: 'b'.repeat(40),
  pathIdentityDigestHex: 'c'.repeat(64) };
const terminal = 'd'.repeat(64);
const workerDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_COMMITTED_RESERVE_STAGE_V1';
const parentDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_COMMITTED_RESERVE_STAGE_V1';
const text = (value: unknown) => `${canonicalJson(value)}\n`;
function primary(stage: Stage = 'check-promotion', cycle: Cycle = 'cycle-1', kind: Kind = 'genesis'): Error {
  return stepTag(rootTag(tag(new Error('unpublished cause'), stage, kind), cycle), cycle, 'committed-reserve');
}
function fixture(stage: Stage = 'check-promotion', cycle: Cycle = 'cycle-1', kind: Kind = 'genesis') {
  const failure = createNativeTwoCycleWorkerFailureDiagnosticV1(bindings,
    'root-or-cleanup', new Error('unpublished cause'));
  const root = createNativeTwoCycleWorkerRootPhaseV2(bindings,
    { primaryPhase: cycle, cleanupErrorCount: 0, ergoNodeStartupPhase: null });
  const step = createNativeTwoCycleWorkerCycleStepV1(bindings, text(failure), text(root),
    { cycle, step: 'committed-reserve' });
  const parentStep = createNativeTwoCycleParentCycleStepV1(bindings, terminal,
    text(failure), text(root), text(step));
  const worker = createWorker(bindings, text(failure), text(root), text(step), stage, kind);
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

describe('private committed-reserve operation stage metadata', () => {
  it('freezes the exact closed stage vocabulary', () => {
    expect(stages).toEqual(['ingress', 'native-check', 'check-promotion', 'authorization',
      'journal-reconciliation', 'operational-execution', 'operational-sign', 'operational-check',
      'operational-revalidate', 'operational-authorize', 'operational-reserve',
      'operational-finalize', 'operational-submit', 'transport-validation', 'confirmation',
      'confirmed-journal', 'output-observation']);
    expect(Object.isFrozen(stages)).toBe(true);
  });
  describe.each(['cycle-1', 'cycle-2'] as const)('%s exact producer ancestry', cycle => {
    describe.each(['genesis', 'continuation'] as const)('%s operation kind', kind => {
    it.each(stages)('projects %s while preserving native error identity', stage => {
      const error = new Error('opaque');
      Object.defineProperties(error, {
        message: { get() { throw new Error('message must not be read'); } },
        stack: { get() { throw new Error('stack must not be read'); } },
        cause: { get() { throw new Error('cause must not be read'); } },
        committedReserveStage: { get() { throw new Error('caller stage must not be read'); } },
        committedReserveKind: { get() { throw new Error('caller kind must not be read'); } },
      });
      const keys = Reflect.ownKeys(error);
      expect(tag(error, stage)).toBe(error);
      expect(tag(error, stage)).toBe(error);
      expect(Reflect.ownKeys(error)).toEqual(keys);
      expect(own(error)).toBe(stage);
      expect(ownKind(error)).toBeNull();
      expect(project(error)).toBeNull();
      stepTag(rootTag(error, cycle), cycle, 'committed-reserve');
      expect(project(error)).toBeNull();
      expect(tag(error, stage, kind)).toBe(error);
      expect(tag(error, stage, kind)).toBe(error);
      expect(Reflect.ownKeys(error)).toEqual(keys);
      expect(own(error)).toBe(stage); expect(ownKind(error)).toBe(kind);
      expect(project(error)).toEqual({ committedReserveStage: stage, committedReserveKind: kind });
      expect(Object.isFrozen(project(error))).toBe(true);
    });
    });
  });

  it.each([undefined, null, 1, 'check-promotion', {}, { committedReserveStage: 'check-promotion' },
    Object.create(Error.prototype), new Proxy(new Error(), {}),
    new Proxy({}, { get() { throw new Error('must not read'); } })])(
    'rejects unknown, forged, proxy or non-Error metadata %#', value => {
      expect(tag(value, 'check-promotion')).toBe(value);
      expect(own(value)).toBeNull();
      expect(ownKind(value)).toBeNull();
      expect(project(value)).toBeNull();
    });
  it('rejects a revoked proxy without invoking its traps', () => {
    const { proxy, revoke } = Proxy.revocable(new Error(), {}); revoke();
    expect(tag(proxy, 'check-promotion')).toBe(proxy);
    expect(own(proxy)).toBeNull();
    expect(ownKind(proxy)).toBeNull();
    expect(project(proxy)).toBeNull();
  });
  it('does not invoke proxy value or prototype traps', () => {
    let traps = 0;
    const handler = { get() { traps++; throw new Error('must not read'); },
      getPrototypeOf() { traps++; throw new Error('must not inspect'); },
      getOwnPropertyDescriptor() { traps++; throw new Error('must not inspect'); } };
    const proxy = new Proxy(new Error(), handler);
    expect(tag(proxy, 'operational-check')).toBe(proxy);
    expect(own(proxy)).toBeNull(); expect(project(proxy)).toBeNull();
    const error = primary();
    Object.setPrototypeOf(error, new Proxy(Error.prototype, handler));
    expect(project(error)).toBeNull();
    expect(traps).toBe(0);
  });
  it.each([Object.freeze, Object.preventExtensions])('tags sealed native errors privately %#', seal => {
    const error = primary(); seal(error);
    expect(tag(error, 'check-promotion')).toBe(error);
    expect(project(error)).toEqual({ committedReserveStage: 'check-promotion', committedReserveKind: 'genesis' });
  });
  it('keeps tracker-context and committed-reserve metadata independent', () => {
    const tracker = stepTag(rootTag(trackerTag(new Error(), 'statement'), 'cycle-1'),
      'cycle-1', 'committed-reserve');
    expect(trackerOwn(tracker)).toBe('statement');
    expect(own(tracker)).toBeNull(); expect(project(tracker)).toBeNull();
    const error = primary();
    expect(trackerOwn(error)).toBeNull();
    expect(project(error)).toEqual({ committedReserveStage: 'check-promotion', committedReserveKind: 'genesis' });
  });
  it.each(['tracker-context', 'tracker-check'] as const)('rejects stale detail on %s', step => {
    const error = stepTag(rootTag(tag(new Error(), 'check-promotion', 'genesis'), 'cycle-1'), 'cycle-1', step);
    expect(own(error)).toBe('check-promotion'); expect(project(error)).toBeNull();
  });
  it('keeps source-lock and committed-reserve metadata independent on the same native error', () => {
    const source = stepTag(rootTag(sourceLockTag(new Error(), 'check-input', 'genesis'),
      'cycle-1'), 'cycle-1', 'source-lock');
    expect(sourceLockOwn(source)).toBe('check-input');
    expect(sourceLockProject(source)).toEqual({ sourceLockStage: 'check-input', sourceLockKind: 'genesis' });
    expect(own(source)).toBeNull(); expect(ownKind(source)).toBeNull(); expect(project(source)).toBeNull();
    const error = primary('operational-sign', 'cycle-1', 'continuation');
    sourceLockTag(error, 'check-input', 'genesis');
    expect(sourceLockOwn(error)).toBe('check-input'); expect(sourceLockProject(error)).toBeNull();
    expect(project(error)).toEqual({ committedReserveStage: 'operational-sign',
      committedReserveKind: 'continuation' });
  });
  it.each(['check-input', 'check-signing', 'check-node', 'check-receipt',
    'post-check-funding', 'pre-transport-funding'] as const)(
    'rejects source-lock-only stage %s without converting the label', stage => {
      const error = primary();
      expect(tag(error, stage as Stage)).toBe(error);
      expect(own(error)).toBeNull(); expect(ownKind(error)).toBeNull(); expect(project(error)).toBeNull();
    });
  it('does not borrow a descendant step for an ancestor stage', () => {
    const child = stepTag(rootTag(new Error(), 'cycle-1'), 'cycle-1', 'committed-reserve');
    const ancestor = rootTag(tag(new AggregateError([child]), 'check-promotion', 'genesis'), 'cycle-1');
    expect(project(ancestor)).toBeNull();
  });
  it('accepts exactly 64 inspected values and rejects the next value', () => {
    const error = primary();
    const aggregate = new AggregateError([error, ...Array.from({ length: 62 }, () => new Error())]);
    expect(project(aggregate)).toEqual({ committedReserveStage: 'check-promotion', committedReserveKind: 'genesis' });
    aggregate.errors.push(new Error());
    expect(project(aggregate)).toBeNull();
  });
  it('validates an untagged tail after the first valid producer', () => {
    const aggregate = new AggregateError([primary(), ...Array.from({ length: 61 }, () => new Error()), null]);
    expect(project(aggregate)).toBeNull();
  });
  it('allows repeated primary references without treating them as multiple producers', () => {
    const error = primary();
    expect(project(new AggregateError([error, error]))).toEqual({
      committedReserveStage: 'check-promotion', committedReserveKind: 'genesis' });
  });
  it('does not infer a stage from Error properties or cause', () => {
    const error = Object.assign(new Error('check-promotion'), {
      stage: 'check-promotion', committedReserveStage: 'check-promotion', committedReserveKind: 'genesis', cause: primary(),
    });
    stepTag(rootTag(error, 'cycle-1'), 'cycle-1', 'committed-reserve');
    expect(own(error)).toBeNull(); expect(ownKind(error)).toBeNull(); expect(project(error)).toBeNull();
  });
  it.each(['different', 'invalid'] as const)('rejects permanent %s stage conflicts', mode => {
    const error = primary();
    tag(error, mode === 'different' ? 'operational-sign' : 'arbitrary' as Stage);
    tag(error, 'check-promotion');
    expect(own(error)).toBeNull(); expect(project(error)).toBeNull();
  });
  it('projects a primary under a cleanup aggregate without borrowing cleanup detail', () => {
    const error = primary();
    const cleanup = rootTag(new Error('opaque'), 'cleanup');
    expect(project(new AggregateError([error, cleanup]))).toEqual({
      committedReserveStage: 'check-promotion', committedReserveKind: 'genesis' });
  });
  it.each(['stage conflict', 'two producers', 'cleanup tag', 'borrowed cycle', 'borrowed step',
    'wrong step', 'wrong cycle', 'cycle graph', 'unknown child', 'sparse children', 'getter child',
    'getter errors', 'proxy children', 'custom iterator', 'over bound', 'shared cleanup',
    'nonarray children', 'custom array prototype', 'cleanup descendant', 'conflicting untagged sibling'] as const)(
    'rejects aggregate or ancestry fault: %s', fault => {
      const error = primary();
      let graph: unknown = new AggregateError([error]);
      const aggregate = graph as AggregateError;
      if (fault === 'stage conflict') tag(error, 'operational-sign');
      if (fault === 'two producers') aggregate.errors.push(primary());
      if (fault === 'cleanup tag') graph = new AggregateError([
        error, rootTag(tag(new Error(), 'check-promotion', 'genesis'), 'cleanup'),
      ]);
      if (fault === 'borrowed cycle') {
        const child = tag(new Error(), 'check-promotion', 'genesis');
        stepTag(child, 'cycle-1', 'committed-reserve');
        graph = rootTag(new AggregateError([child]), 'cycle-1');
      }
      if (fault === 'borrowed step') {
        const child = rootTag(tag(new Error(), 'check-promotion', 'genesis'), 'cycle-1');
        graph = stepTag(rootTag(new AggregateError([child]), 'cycle-1'), 'cycle-1', 'committed-reserve');
      }
      if (fault === 'wrong step') stepTag(error, 'cycle-1', 'tracker-check');
      if (fault === 'wrong cycle') graph = stepTag(
        rootTag(tag(new Error(), 'check-promotion', 'genesis'), 'cycle-2'), 'cycle-1', 'committed-reserve',
      );
      if (fault === 'cycle graph') aggregate.errors.push(aggregate);
      if (fault === 'unknown child') aggregate.errors.push('check-promotion');
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
      if (fault === 'nonarray children') Object.defineProperty(aggregate, 'errors', { value: {} });
      if (fault === 'custom array prototype') Object.setPrototypeOf(aggregate.errors, null);
      if (fault === 'cleanup descendant') graph = new AggregateError([
        error, rootTag(new AggregateError([primary()]), 'cleanup'),
      ]);
      if (fault === 'conflicting untagged sibling') {
        const sibling = new Error(); tag(sibling, 'ingress'); tag(sibling, 'native-check');
        aggregate.errors.push(sibling);
      }
      expect(project(graph)).toBeNull();
    });
  it('requires the exact stage-bearing producer to own its kind', () => {
    const error = stepTag(rootTag(tag(new Error(), 'operational-check'), 'cycle-1'), 'cycle-1', 'committed-reserve');
    expect(own(error)).toBe('operational-check'); expect(ownKind(error)).toBeNull();
    expect(project(error)).toBeNull();
    expect(tag(error, 'operational-check', 'continuation')).toBe(error);
    expect(project(error)).toEqual({ committedReserveStage: 'operational-check', committedReserveKind: 'continuation' });
    tag(error, 'operational-check');
    expect(ownKind(error)).toBe('continuation');
    expect(project(error)).toEqual({ committedReserveStage: 'operational-check', committedReserveKind: 'continuation' });
  });
  it('does not infer a missing kind from properties, message or cause', () => {
    const error = stepTag(rootTag(tag(new Error('genesis', { cause: primary() }), 'operational-check'),
      'cycle-1'), 'cycle-1', 'committed-reserve');
    Object.defineProperty(error, 'committedReserveKind', {
      get() { throw new Error('kind property must not be read'); },
    });
    expect(own(error)).toBe('operational-check'); expect(ownKind(error)).toBeNull();
    expect(project(error)).toBeNull();
  });
  it.each(['ancestor', 'descendant', 'sibling'] as const)('does not borrow %s operation kind', placement => {
    const error = stepTag(rootTag(tag(new Error(), 'operational-check'), 'cycle-1'), 'cycle-1', 'committed-reserve');
    let graph: unknown;
    if (placement === 'ancestor') graph = tag(new AggregateError([error]), 'operational-check', 'genesis');
    else if (placement === 'descendant') {
      const aggregate = stepTag(rootTag(tag(new AggregateError([primary('operational-check')]), 'operational-check'),
        'cycle-1'), 'cycle-1', 'committed-reserve');
      graph = aggregate;
    } else graph = new AggregateError([error, primary('operational-check')]);
    expect(ownKind(error)).toBeNull(); expect(project(graph)).toBeNull();
  });
  it.each(['genesis', 'continuation'] as const)('rejects a conflicting %s kind permanently', first => {
    const error = primary('operational-check', 'cycle-1', first);
    expect(tag(error, 'operational-check', first === 'genesis' ? 'continuation' : 'genesis')).toBe(error);
    tag(error, 'operational-check', first);
    expect(own(error)).toBeNull(); expect(ownKind(error)).toBeNull(); expect(project(error)).toBeNull();
  });
  it.each([null, 1, {}, '', 'arbitrary', 'Genesis'])('rejects invalid tagged kind %# permanently', invalid => {
    const error = primary('operational-check');
    expect(tag(error, 'operational-check', invalid as Kind)).toBe(error);
    tag(error, 'operational-check', 'genesis');
    expect(own(error)).toBeNull(); expect(ownKind(error)).toBeNull(); expect(project(error)).toBeNull();
  });
  it.each(['genesis', 'continuation'] as const)('rejects %s kind under a cleanup ancestor', kind => {
    const error = primary('operational-check', 'cycle-1', kind);
    const graph = rootTag(new AggregateError([error]), 'cleanup');
    expect(ownKind(error)).toBe(kind); expect(project(graph)).toBeNull();
  });
  it('rejects two operation kinds even when both producers have the same stage and cycle', () => {
    expect(project(new AggregateError([
      primary('operational-check', 'cycle-1', 'genesis'), primary('operational-check', 'cycle-1', 'continuation'),
    ]))).toBeNull();
  });
});

const workerFields = ['schema', 'version', 'status', 'configSha256Hex', 'expectedBridgeCommit',
  'pathIdentityDigestHex', 'workerFailureReceiptDigestHex', 'workerRootPhaseV2ReceiptDigestHex',
  'workerCycleStepReceiptDigestHex', 'cycle', 'step', 'committedReserveStage', 'committedReserveKind',
  'operationCompletionEstablished', 'rootCleanupEstablished', 'rawCausePublished', 'receiptDigestHex'];
const parentFields = [...workerFields, 'failureReceiptDigestHex',
  'workerCommittedReserveStageReceiptDigestHex', 'parentCycleStepReceiptDigestHex'];
function replacement(field: string): unknown {
  if (field === 'cycle') return 'cycle-2';
  if (field === 'step') return 'tracker-check';
  if (field === 'committedReserveStage') return 'unknown';
  if (field === 'committedReserveKind') return 'unknown';
  if (field.endsWith('Hex')) return 'e'.repeat(64);
  if (field === 'expectedBridgeCommit') return 'e'.repeat(40);
  if (field === 'version') return 2;
  if (field.endsWith('Established') || field === 'rawCausePublished') return true;
  return 'foreign';
}

describe('committed reserve stage worker and parent receipt ancestry', () => {
  describe.each(['cycle-1', 'cycle-2'] as const)('%s exact encoding', cycle => {
    describe.each(['genesis', 'continuation'] as const)('%s operation kind', kind => {
    it.each(stages)('roundtrips closed stage %s', stage => {
      const f = fixture(stage, cycle, kind);
      expect(readWorker(text(f.worker), f)).toEqual(f.worker);
      expect(readParent(text(f.parent), f)).toEqual(f.parent);
      expect(f.parent).toMatchObject({ cycle, step: 'committed-reserve', committedReserveStage: stage, committedReserveKind: kind,
        workerCommittedReserveStageReceiptDigestHex: f.worker.receiptDigestHex,
        parentCycleStepReceiptDigestHex: f.parentStep.receiptDigestHex,
        failureReceiptDigestHex: terminal, operationCompletionEstablished: false,
        rootCleanupEstablished: false, rawCausePublished: false });
      expect(Object.isFrozen(f.worker)).toBe(true); expect(Object.isFrozen(f.parent)).toBe(true);
      expect(text(f.parent)).not.toMatch(/unpublished|opaque|message|stack|[A-Za-z]:[\\/]/u);
    });
    });
  });
  it.each(workerFields)('rejects independently changed worker %s after rehash', field => {
    const f = fixture(); const candidate = { ...f.worker, [field]: replacement(field) };
    expect(() => readWorker(text(field === 'receiptDigestHex' ? candidate
      : resign(candidate, workerDomain)), f)).toThrow();
  });
  it.each(parentFields)('rejects independently changed parent %s after rehash', field => {
    const f = fixture(); const candidate = { ...f.parent,
      [field]: field === 'committedReserveStage' ? 'operational-sign' : replacement(field) };
    expect(() => readParent(text(field === 'receiptDigestHex' ? candidate
      : resign(candidate, parentDomain)), f)).toThrow();
  });
  describe.each(['worker', 'parent'] as const)('%s canonical bounded text', surface => {
    it.each(['extra', 'missing', 'duplicate', 'escaped duplicate', 'whitespace', 'no newline',
      'CRLF', 'second newline', 'invalid', 'nonobject', 'array', 'unicode bound',
      'wrong domain', 'legacy domain', 'tracker domain', 'source-lock domain',
      'unseparated domain'] as const)('rejects %s', mutation => {
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
      if (mutation === 'tracker domain') candidate = text(resign(record,
        `E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_${surface.toUpperCase()}_TRACKER_CONTEXT_V1`));
      if (mutation === 'source-lock domain') candidate = text(resign(record,
        `E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_${surface.toUpperCase()}_SOURCE_LOCK_STAGE_V1`));
      if (mutation === 'unseparated domain') candidate = text(resign(record, ''));
      expect(() => surface === 'worker' ? readWorker(candidate, f) : readParent(candidate, f)).toThrow();
    });
  });
  it.each(['failure', 'root', 'step', 'parentStep', 'worker'] as const)(
    'rejects exact ancestor substitution: %s', ancestor => {
      const f = fixture(); const other = fixture('operational-sign', 'cycle-2');
      const changed = { ...f, [ancestor]: ancestor === 'failure'
        ? createNativeTwoCycleWorkerFailureDiagnosticV1(bindings, 'pre-root', new Error())
        : other[ancestor] };
      expect(() => readParent(text(f.parent), changed)).toThrow();
    });
  it.each(NATIVE_TWO_CYCLE_CYCLE_STEPS_V1.filter(step => step !== 'committed-reserve'))(
    'rejects a validated other step: %s', step => {
      const f = fixture();
      const otherStep = createNativeTwoCycleWorkerCycleStepV1(bindings, text(f.failure), text(f.root),
        { cycle: 'cycle-1', step });
      expect(() => createWorker(bindings, text(f.failure), text(f.root), text(otherStep),
        'check-promotion', 'genesis')).toThrow();
    });
  it('rejects a changed terminal digest even with unchanged ancestors', () => {
    const f = fixture();
    expect(() => createParent(bindings, 'e'.repeat(64), text(f.failure), text(f.root), text(f.step),
      text(f.worker), text(f.parentStep))).toThrow();
  });
  it('allows a closed worker assertion but never authenticates its producer', () => {
    const f = fixture();
    const changed = resign({ ...f.worker, committedReserveStage: 'operational-sign' }, workerDomain);
    expect(readWorker(text(changed), f).committedReserveStage).toBe('operational-sign');
    expect(() => readParent(text(f.parent), { ...f, worker: changed as typeof f.worker })).toThrow();
  });
  it.each(['genesis', 'continuation'] as const)('binds the exact validated %s worker kind', kind => {
    const f = fixture('operational-check', 'cycle-1', kind);
    const otherKind = kind === 'genesis' ? 'continuation' : 'genesis';
    const changed = resign({ ...f.worker, committedReserveKind: otherKind }, workerDomain);
    expect(readWorker(text(changed), f).committedReserveKind).toBe(otherKind);
    expect(() => readParent(text(f.parent), { ...f, worker: changed as typeof f.worker })).toThrow();
    const changedParent = resign({ ...f.parent, committedReserveKind: otherKind }, parentDomain);
    expect(() => readParent(text(changedParent), f)).toThrow();
  });
  it.each(['genesis', 'continuation'] as const)('rejects transplanting a different kind into %s ancestry', kind => {
    const f = fixture('operational-check', 'cycle-1', kind);
    const other = fixture('operational-check', 'cycle-1', kind === 'genesis' ? 'continuation' : 'genesis');
    expect(() => readParent(text(f.parent), { ...f, worker: other.worker })).toThrow();
    expect(() => readParent(text(other.parent), f)).toThrow();
  });
  describe.each(['worker', 'parent'] as const)('%s requires an explicit closed kind', surface => {
    it('rejects a missing kind even after rehash', () => {
      const f = fixture(); const record = surface === 'worker' ? f.worker : f.parent;
      const { committedReserveKind: ignored, ...body } = record; void ignored;
      const candidate = text(resign(body, surface === 'worker' ? workerDomain : parentDomain));
      expect(() => surface === 'worker' ? readWorker(candidate, f) : readParent(candidate, f)).toThrow();
    });
    it.each([null, 1, {}, '', 'arbitrary', 'Genesis'])('rejects invalid kind %# after rehash', invalid => {
      const f = fixture(); const record = surface === 'worker' ? f.worker : f.parent;
      const candidate = text(resign({ ...record, committedReserveKind: invalid },
        surface === 'worker' ? workerDomain : parentDomain));
      expect(() => surface === 'worker' ? readWorker(candidate, f) : readParent(candidate, f)).toThrow();
    });
  });
  it.each(['configSha256Hex', 'expectedBridgeCommit', 'pathIdentityDigestHex'] as const)(
    'rejects independently changed expected identity %s', field => {
      const f = fixture(); const changed = { ...bindings, [field]: replacement(field) };
      expect(() => parseWorker(text(f.worker), changed, text(f.failure), text(f.root), text(f.step))).toThrow();
      expect(() => parseParent(text(f.parent), changed, terminal, text(f.failure), text(f.root),
        text(f.step), text(f.worker), text(f.parentStep))).toThrow();
    });
  describe.each(['configSha256Hex', 'expectedBridgeCommit', 'pathIdentityDigestHex'] as const)(
    'malformed expected %s', field => {
      it.each(['uppercase', 'short', 'long', 'null', 'number', 'nonhex'] as const)(
        'rejects %s before creating a companion', mutation => {
        const f = fixture();
        const invalid = mutation === 'uppercase' ? bindings[field].toUpperCase()
          : mutation === 'short' ? bindings[field].slice(1)
          : mutation === 'long' ? `${bindings[field]}0`
          : mutation === 'null' ? null : mutation === 'number' ? 1
          : 'g'.repeat(bindings[field].length);
        expect(() => createWorker({ ...bindings, [field]: invalid } as typeof bindings,
          text(f.failure), text(f.root), text(f.step), 'check-promotion', 'genesis')).toThrow();
        });
    });
  it.each(['extra', 'missing', 'null', 'array'] as const)('rejects %s expected bindings', mutation => {
    const f = fixture(); const { configSha256Hex: ignored, ...missing } = bindings; void ignored;
    const changed = mutation === 'extra' ? { ...bindings, rawCause: 'unknown' }
      : mutation === 'missing' ? missing : mutation === 'null' ? null : [];
    expect(() => createWorker(changed as typeof bindings, text(f.failure), text(f.root),
      text(f.step), 'check-promotion', 'genesis')).toThrow();
  });
  it.each([undefined, null, 1, {}, '', 'arbitrary'])('rejects unsupported created stage %#', invalid => {
    const f = fixture();
    expect(() => createWorker(bindings, text(f.failure), text(f.root), text(f.step),
      invalid as Stage, 'genesis')).toThrow();
  });
  it.each([undefined, null, 1, {}, '', 'arbitrary', 'Genesis'])('rejects unsupported created kind %#', invalid => {
    const f = fixture();
    expect(() => createWorker(bindings, text(f.failure), text(f.root), text(f.step),
      'check-promotion', invalid as Kind)).toThrow();
  });
});
