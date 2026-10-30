import { describe, expect, it, vi } from 'vitest';

import * as json from './ergo-settlement-core/strict-json.js';
import { tagNativeTwoCycleCycleStepFailureV1 as stepTag }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';
import { createNativeTwoCycleWorkerCycleStepV1, createNativeTwoCycleParentCycleStepV1 }
  from './substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { createNativeTwoCycleWorkerFailureDiagnosticV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 as rootTag }
  from './substrate-federated-native-two-cycle-root-phase-v1.js';
import { createNativeTwoCycleWorkerRootPhaseV2 }
  from './substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';
import {
  NATIVE_DEPOSIT_FUNDING_SUBSTAGES_V1 as substages,
  createNativeDepositFundingSubstageTaggerV1 as factory,
  projectNativeDepositFundingSubstageV1 as project,
  createNativeTwoCycleWorkerDepositFundingSubstageV1 as createWorker,
  parseNativeTwoCycleWorkerDepositFundingSubstageV1 as parseWorker,
  createNativeTwoCycleParentDepositFundingSubstageV1 as createParent,
  parseNativeTwoCycleParentDepositFundingSubstageV1 as parseParent,
  type NativeDepositFundingSubstageV1 as Substage,
} from './substrate-federated-native-deposit-funding-substage-v1.js';

type Cycle = 'cycle-1' | 'cycle-2';
const bindings = {
  configSha256Hex: 'a'.repeat(64),
  expectedBridgeCommit: 'b'.repeat(40),
  pathIdentityDigestHex: 'c'.repeat(64),
};
const terminal = 'd'.repeat(64);
const workerDomain =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_DEPOSIT_FUNDING_SUBSTAGE_V1';
const parentDomain =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_DEPOSIT_FUNDING_SUBSTAGE_V1';
const text = (value: unknown) => `${json.canonicalJson(value)}\n`;

function primary(cycle: Cycle = 'cycle-1'): Error {
  return stepTag(rootTag(new Error('opaque'), cycle), cycle, 'deposit-funding');
}

function tagged(substage: Substage = substages[0], cycle: Cycle = 'cycle-1'): Error {
  const error = primary(cycle);
  factory()(error, substage);
  return error;
}

function fixture(substage: Substage = substages[0], cycle: Cycle = 'cycle-1') {
  const failure = createNativeTwoCycleWorkerFailureDiagnosticV1(
    bindings, 'root-or-cleanup', new Error('opaque'));
  const root = createNativeTwoCycleWorkerRootPhaseV2(bindings,
    { primaryPhase: cycle, cleanupErrorCount: 0, ergoNodeStartupPhase: null });
  const step = createNativeTwoCycleWorkerCycleStepV1(bindings, text(failure), text(root),
    { cycle, step: 'deposit-funding' });
  const parentStep = createNativeTwoCycleParentCycleStepV1(
    bindings, terminal, text(failure), text(root), text(step));
  const workerLineage = {
    workerFailureText: text(failure),
    workerRootPhaseV2Text: text(root),
    workerCycleStepText: text(step),
  };
  const worker = createWorker(bindings, workerLineage, substage);
  const lineage = {
    ...workerLineage,
    parentCycleStepText: text(parentStep),
    workerDepositFundingSubstageText: text(worker),
  };
  const parent = createParent(bindings, terminal, lineage);
  return { failure, root, step, parentStep, workerLineage, worker, lineage, parent };
}

function resign(value: object, domain: string): Record<string, unknown> {
  const { receiptDigestHex: ignored, ...body } = value as Record<string, unknown>;
  void ignored;
  return { ...body, receiptDigestHex: json.sha256CanonicalJson(body, domain) };
}

describe('source-invocation deposit-funding substage metadata', () => {
  it('has exactly eight frozen substages', () => {
    expect(substages).toEqual([
      'owned-transaction-hold',
      'post-hold-owner-custody-guard',
      'prior-confirmation-revalidation',
      'post-revalidation-owner-custody-guard',
      'owned-reward-input-discovery',
      'post-discovery-owner-custody-guard',
      'owned-reward-input-provenance',
      'held-funding-equality',
    ]);
    expect(Object.isFrozen(substages)).toBe(true);
  });

  describe.each(['cycle-1', 'cycle-2'] as const)('%s', cycle => {
    it.each(substages)('preserves the exact error and projects %s', substage => {
      const error = primary(cycle);
      const tag = factory();
      const keys = Reflect.ownKeys(error);
      expect(tag(error, substage)).toBe(error);
      expect(tag(error, substage)).toBe(error);
      expect(error.message).toBe('opaque');
      expect(Reflect.ownKeys(error)).toEqual(keys);
      expect(project(error)).toBe(substage);
      const cleanup = rootTag(new Error('cleanup'), 'cleanup');
      expect(project(new AggregateError([error, cleanup]))).toBe(substage);
    });
  });

  it.each([Object.freeze, Object.preventExtensions])('preserves sealed native errors %#', seal => {
    const error = primary();
    seal(error);
    expect(factory()(error, substages[0])).toBe(error);
    expect(project(error)).toBe(substages[0]);
  });

  it.each([undefined, null, 1, 'opaque', {}, Object.create(Error.prototype)])(
    'returns non-native value unchanged and refuses it %#', value => {
      expect(factory()(value, substages[0])).toBe(value);
      expect(project(value)).toBeNull();
    });

  it.each(substages)('permanently refuses cross-invocation reuse for %s', substage => {
    const error = primary();
    const first = factory();
    first(error, substage);
    expect(project(error)).toBe(substage);
    factory()(error, substage);
    first(error, substage);
    expect(project(error)).toBeNull();
  });

  it.each(substages.slice(1))('permanently refuses conflicting substage %s', substage => {
    const error = primary();
    const tag = factory();
    tag(error, substages[0]);
    tag(error, substage);
    tag(error, substages[0]);
    expect(project(error)).toBeNull();
  });

  it.each([undefined, null, 1, {}, '', 'Owned-transaction-hold'])(
    'poisons unsupported substage %# without throwing', value => {
      const error = primary();
      const tag = factory();
      tag(error, substages[0]);
      expect(tag(error, value as Substage)).toBe(error);
      expect(project(error)).toBeNull();
    });

  it('does not revive a stale token after hostile cross-invocation reuse', () => {
    const error = primary();
    const first = factory();
    first(error, substages[0]);
    Object.defineProperty(error, 'cause', {
      configurable: true,
      get() { throw new Error('unread'); },
    });
    factory()(error, substages[0]);
    Reflect.deleteProperty(error, 'cause');
    first(error, substages[0]);
    expect(project(error)).toBeNull();
  });

  it.each(['missing root', 'missing step', 'wrong cycle', 'wrong step', 'cleanup primary',
    'cleanup ancestor', 'two primaries', 'two tagged primaries', 'tagged sibling',
    'tagged ancestor'] as const)('requires unique exact own ancestry: %s', fault => {
    let error: Error;
    if (fault === 'missing root') error = stepTag(new Error(), 'cycle-1', 'deposit-funding');
    else if (fault === 'missing step') error = rootTag(new Error(), 'cycle-1');
    else if (fault === 'cleanup primary') {
      error = stepTag(rootTag(new Error(), 'cleanup'), 'cycle-1', 'deposit-funding');
    } else error = primary();
    factory()(error, substages[0]);
    const graph = new AggregateError([error]);
    let value: unknown = error;
    if (fault === 'wrong cycle') stepTag(error, 'cycle-2', 'deposit-funding');
    if (fault === 'wrong step') stepTag(error, 'cycle-1', 'source-lock');
    if (fault === 'cleanup ancestor') { rootTag(graph, 'cleanup'); value = graph; }
    if (fault === 'two primaries') {
      graph.errors.push(primary()); value = graph;
    }
    if (fault === 'two tagged primaries') {
      graph.errors.push(tagged(substages[0])); value = graph;
    }
    if (fault === 'tagged sibling') {
      graph.errors.push(factory()(new Error(), substages[0])); value = graph;
    }
    if (fault === 'tagged ancestor') { factory()(graph, substages[0]); value = graph; }
    expect(project(value)).toBeNull();
  });

  it('accepts a repeated edge to the same primary and enforces the 64-value bound', () => {
    const error = tagged();
    expect(project(new AggregateError([error, error]))).toBe(substages[0]);
    const graph = new AggregateError([error, ...Array.from({ length: 62 }, () => new Error())]);
    expect(project(graph)).toBe(substages[0]);
    graph.errors.push(new Error());
    expect(project(graph)).toBeNull();
  });

  it.each(['cycle', 'primitive', 'sparse array', 'own iterator', 'array prototype',
    'ordinary errors field', 'masked aggregate', 'masked child'] as const)(
    'fails closed for unsafe graph %s', fault => {
      const error = tagged();
      const graph = new AggregateError([error]);
      let value: unknown = graph;
      if (fault === 'cycle') graph.errors.push(graph);
      if (fault === 'primitive') graph.errors.push('opaque');
      if (fault === 'sparse array') graph.errors.length = 2;
      if (fault === 'own iterator') {
        graph.errors[Symbol.iterator] = function* () { throw new Error('unread'); };
      }
      if (fault === 'array prototype') Object.setPrototypeOf(graph.errors, null);
      if (fault === 'ordinary errors field') Object.defineProperty(error, 'errors', { value: [] });
      if (fault === 'masked aggregate') Object.setPrototypeOf(graph, Error.prototype);
      if (fault === 'masked child') {
        const child = new AggregateError([]);
        Object.setPrototypeOf(child, Error.prototype);
        graph.errors.push(child);
      }
      expect(project(value)).toBeNull();
    });

  it.each(['root', 'error', 'error prototype', 'ancestor prototype', 'array',
    'array prototype', 'child', 'revoked'] as const)(
    'rejects %s proxy without executing traps', placement => {
      let traps = 0;
      const handler: ProxyHandler<object> = {
        get() { traps++; throw new Error('trap'); },
        getPrototypeOf() { traps++; throw new Error('trap'); },
        ownKeys() { traps++; throw new Error('trap'); },
        getOwnPropertyDescriptor() { traps++; throw new Error('trap'); },
      };
      const error = tagged();
      const graph = new AggregateError([error]);
      let value: unknown = graph;
      if (placement === 'root') value = new Proxy(graph, handler);
      if (placement === 'error') value = new Proxy(error, handler);
      if (placement === 'error prototype') Object.setPrototypeOf(error, new Proxy(Error.prototype, handler));
      if (placement === 'ancestor prototype') {
        const prototype = Object.create(new Proxy(Error.prototype, handler));
        Object.setPrototypeOf(error, prototype);
      }
      if (placement === 'array') graph.errors = new Proxy([error], handler) as unknown as Error[];
      if (placement === 'array prototype') {
        Object.setPrototypeOf(graph.errors, new Proxy(Array.prototype, handler));
      }
      if (placement === 'child') graph.errors.push(new Proxy(new Error(), handler));
      if (placement === 'revoked') {
        const item = Proxy.revocable(error, handler);
        item.revoke();
        value = item.proxy;
      }
      expect(factory()(value, substages[0])).toBe(value);
      expect(project(value)).toBeNull();
      expect(traps).toBe(0);
    });

  it.each(['message', 'stack', 'cause', 'substage', 'errors', 'child', 'prototype'] as const)(
    'rejects %s accessor without invoking it', field => {
      let reads = 0;
      const error = tagged();
      const graph = new AggregateError([error]);
      const descriptor = { configurable: true, get() { reads++; throw new Error('unread'); } };
      if (field === 'child') Object.defineProperty(graph.errors, '0', descriptor);
      else if (field === 'errors') Object.defineProperty(graph, 'errors', descriptor);
      else if (field === 'prototype') {
        const prototype = Object.create(Error.prototype);
        Object.defineProperty(prototype, 'name', descriptor);
        Object.setPrototypeOf(error, prototype);
      } else Object.defineProperty(error, field, descriptor);
      expect(project(graph)).toBeNull();
      expect(reads).toBe(0);
    });

  it('does not infer from messages, caller fields or raw cause', () => {
    const error = primary();
    Object.assign(error, {
      depositFundingSubstage: substages[0],
      cause: tagged(substages[0]),
    });
    error.message = substages[0];
    expect(project(error)).toBeNull();
  });
});

function replacement(field: string): unknown {
  if (field.endsWith('Established') || field === 'rawCausePublished') return true;
  if (field === 'version') return 2;
  if (field === 'cycle') return 'cycle-2';
  if (field === 'step') return 'source-lock';
  if (field === 'depositFundingSubstage') return 'unsupported';
  if (field === 'expectedBridgeCommit') return 'e'.repeat(40);
  return field.endsWith('Hex') ? 'e'.repeat(64) : 'unsupported';
}

const sample = fixture();

describe('prospective deposit-funding substage companions', () => {
  describe.each(['cycle-1', 'cycle-2'] as const)('%s', cycle => {
    it.each(substages)('roundtrips %s with exact existing ancestry', substage => {
      const f = fixture(substage, cycle);
      const oldBytes = [f.failure, f.root, f.step, f.parentStep].map(text);
      expect(parseWorker(text(f.worker), bindings, f.workerLineage)).toEqual(f.worker);
      expect(parseParent(text(f.parent), bindings, terminal, f.lineage)).toEqual(f.parent);
      expect(f.worker).toMatchObject({
        cycle,
        step: 'deposit-funding',
        depositFundingSubstage: substage,
        workerFailureReceiptDigestHex: f.failure.receiptDigestHex,
        workerRootPhaseV2ReceiptDigestHex: f.root.receiptDigestHex,
        workerCycleStepReceiptDigestHex: f.step.receiptDigestHex,
        operationCompletionEstablished: false,
        rootCleanupEstablished: false,
        rawCausePublished: false,
      });
      expect(f.parent).toMatchObject({
        failureReceiptDigestHex: terminal,
        parentCycleStepReceiptDigestHex: f.parentStep.receiptDigestHex,
        workerDepositFundingSubstageReceiptDigestHex: f.worker.receiptDigestHex,
      });
      expect(Object.isFrozen(f.worker)).toBe(true);
      expect(Object.isFrozen(f.parent)).toBe(true);
      expect([f.failure, f.root, f.step, f.parentStep].map(text)).toEqual(oldBytes);
      expect(text(f.parent)).not.toMatch(/opaque|message|stack|cleanupSucceeded/i);
    });
  });

  describe.each(['worker', 'parent'] as const)('%s', surface => {
    const fields = Object.keys(sample[surface]);
    const domain = surface === 'worker' ? workerDomain : parentDomain;
    const parse = (value: string, f = sample) => surface === 'worker'
      ? parseWorker(value, bindings, f.workerLineage)
      : parseParent(value, bindings, terminal, f.lineage);

    it.each(fields)('rejects independently changed %s after rehash', field => {
      const changed = { ...sample[surface], [field]: replacement(field) };
      const candidate = field === 'receiptDigestHex' ? changed : resign(changed, domain);
      expect(() => parse(text(candidate))).toThrow();
    });

    it.each(fields)('rejects independently wrong-type %s after rehash', field => {
      const changed = { ...sample[surface], [field]: null };
      const candidate = field === 'receiptDigestHex' ? changed : resign(changed, domain);
      expect(() => parse(text(candidate))).toThrow();
    });

    it.each(fields)('rejects missing %s', field => {
      const changed: Record<string, unknown> = { ...sample[surface] };
      delete changed[field];
      expect(() => parse(text(changed))).toThrow();
    });

    it.each(['extra', 'duplicate', 'escaped duplicate', 'whitespace', 'no LF', 'CRLF',
      'two LF', 'invalid JSON', 'null', 'array', 'wrong domain', 'no domain'] as const)(
      'refuses %s', fault => {
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
        if (fault === 'wrong domain') {
          candidate = text(resign(sample[surface], surface === 'worker' ? parentDomain : workerDomain));
        }
        if (fault === 'no domain') candidate = text(resign(sample[surface], ''));
        expect(() => parse(candidate)).toThrow();
      });

    it('refuses over-16KiB UTF-8 before invoking duplicate-key scanning', () => {
      const scan = vi.spyOn(json, 'assertNoDuplicateJsonKeys');
      try {
        expect(() => parse('é'.repeat(8193))).toThrow(/16 KiB/);
        expect(scan).not.toHaveBeenCalled();
      } finally { scan.mockRestore(); }
    });

    it.each([undefined, null, 1, {}, new String('text')])('refuses non-string wire %#', value => {
      expect(() => parse(value as string)).toThrow();
    });
  });

  it.each(Object.keys(bindings) as (keyof typeof bindings)[])('binds exact %s', field => {
    const changed = { ...bindings, [field]: replacement(field) } as typeof bindings;
    expect(() => parseWorker(text(sample.worker), changed, sample.workerLineage)).toThrow();
    expect(() => parseParent(text(sample.parent), changed, terminal, sample.lineage)).toThrow();
  });

  it.each(Object.keys(sample.workerLineage) as (keyof typeof sample.workerLineage)[])(
    'requires fully parsed worker ancestor %s', field => {
      const other = fixture(substages[0], 'cycle-2');
      const alternate = field === 'workerFailureText'
        ? text(createNativeTwoCycleWorkerFailureDiagnosticV1(bindings, 'pre-root', new Error()))
        : other.workerLineage[field];
      expect(() => parseWorker(text(sample.worker), bindings,
        { ...sample.workerLineage, [field]: alternate })).toThrow();
      expect(() => parseWorker(text(sample.worker), bindings,
        { ...sample.workerLineage, [field]: '{\n' })).toThrow();
    });

  it.each(['parentCycleStepText', 'workerDepositFundingSubstageText'] as const)(
    'requires exact parent ancestor %s', field => {
      const other = fixture(substages[1], 'cycle-2');
      expect(() => parseParent(text(sample.parent), bindings, terminal,
        { ...sample.lineage, [field]: other.lineage[field] })).toThrow();
      expect(() => parseParent(text(sample.parent), bindings, terminal,
        { ...sample.lineage, [field]: '{\n' })).toThrow();
    });

  it('binds the terminal failure and validated parent cycle step', () => {
    expect(() => createParent(bindings, 'e'.repeat(64), sample.lineage)).toThrow();
    expect(() => parseParent(text(sample.parent), bindings, 'e'.repeat(64), sample.lineage)).toThrow();
    const sourceLock = createNativeTwoCycleWorkerCycleStepV1(bindings,
      sample.lineage.workerFailureText, sample.lineage.workerRootPhaseV2Text,
      { cycle: 'cycle-1', step: 'source-lock' });
    const parentSourceLock = createNativeTwoCycleParentCycleStepV1(bindings, terminal,
      sample.lineage.workerFailureText, sample.lineage.workerRootPhaseV2Text, text(sourceLock));
    expect(() => createParent(bindings, terminal, {
      ...sample.lineage,
      workerCycleStepText: text(sourceLock),
      parentCycleStepText: text(parentSourceLock),
    })).toThrow(/deposit-funding/);
  });

  it.each([undefined, null, 1, {}, '', 'unsupported'])(
    'rejects created unsupported substage %#', substage => {
      expect(() => createWorker(bindings, sample.workerLineage, substage as Substage)).toThrow();
    });

  it('does not treat partial worker bytes as lineage data', () => {
    const partial = text({ depositFundingSubstage: substages[0] });
    expect(() => createParent(bindings, terminal,
      { ...sample.lineage, workerDepositFundingSubstageText: partial })).toThrow();
  });

  it.each(['bindings', 'worker lineage', 'parent lineage'] as const)(
    'refuses hostile %s without consulting getters or proxy traps', surface => {
      let consulted = 0;
      const original = surface === 'bindings' ? bindings
        : surface === 'worker lineage' ? sample.workerLineage : sample.lineage;
      const field = Object.keys(original)[0]!;
      const accessor = { ...original };
      Object.defineProperty(accessor, field, { get() { consulted++; throw new Error('unread'); } });
      const proxy = new Proxy(original, {
        ownKeys() { consulted++; throw new Error('unread'); },
        getPrototypeOf() { consulted++; throw new Error('unread'); },
        get() { consulted++; throw new Error('unread'); },
      });
      for (const hostile of [accessor, proxy]) {
        if (surface === 'bindings') {
          expect(() => createWorker(hostile as typeof bindings,
            sample.workerLineage, substages[0])).toThrow();
        } else if (surface === 'worker lineage') {
          expect(() => createWorker(bindings,
            hostile as typeof sample.workerLineage, substages[0])).toThrow();
        } else {
          expect(() => createParent(bindings, terminal,
            hostile as typeof sample.lineage)).toThrow();
        }
      }
      expect(consulted).toBe(0);
    });
});
