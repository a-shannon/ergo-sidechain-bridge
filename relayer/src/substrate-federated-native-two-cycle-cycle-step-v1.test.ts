import { describe, expect, it } from 'vitest';

import {
  NATIVE_TWO_CYCLE_CYCLE_STEPS_V1,
  projectNativeTwoCycleCycleStepFailureV1,
  tagNativeTwoCycleCycleStepFailureV1,
  type NativeTwoCycleCycleStepV1,
} from './substrate-federated-native-two-cycle-cycle-step-v1.js';
import {
  projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2,
  tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2,
} from './substrate-federated-native-two-cycle-root-phase-v2.js';

const tagged = (cycle: 'cycle-1' | 'cycle-2' = 'cycle-1',
  step: NativeTwoCycleCycleStepV1 = 'target-entry') => {
  const error = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(new Error(), cycle);
  return tagNativeTwoCycleCycleStepFailureV1(error, cycle, step);
};

describe('native two-cycle cycle-step failure projection V1', () => {
  it.each(NATIVE_TWO_CYCLE_CYCLE_STEPS_V1)('projects closed step %s in either cycle', step => {
    for (const cycle of ['cycle-1', 'cycle-2'] as const) {
      const error = tagged(cycle, step);
      const before = projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(error);
      expect(tagNativeTwoCycleCycleStepFailureV1(error, cycle, step)).toBe(error);
      const projected = projectNativeTwoCycleCycleStepFailureV1(error);
      expect(projected).toEqual({ cycle, step });
      expect(Object.isFrozen(projected)).toBe(true);
      expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(error)).toEqual(before);
    }
    expect(Object.isFrozen(NATIVE_TWO_CYCLE_CYCLE_STEPS_V1)).toBe(true);
  });

  it('never reads message, stack, cause or arbitrary object properties', () => {
    const error = tagged();
    for (const key of ['message', 'stack', 'cause']) {
      Object.defineProperty(error, key, { get() { throw new Error('must not read'); } });
    }
    expect(projectNativeTwoCycleCycleStepFailureV1(error)).toEqual({
      cycle: 'cycle-1', step: 'target-entry',
    });
    const raw = { get message() { throw new Error('must not read'); } };
    expect(tagNativeTwoCycleCycleStepFailureV1(raw, 'cycle-1', 'target-entry')).toBe(raw);
    expect(projectNativeTwoCycleCycleStepFailureV1(raw)).toBeNull();
  });

  it.each([undefined, null, 'primitive', 1, {}, Object.create(Error.prototype)])(
    'retains an unsupported thrown value %# without projecting it', value => {
      expect(tagNativeTwoCycleCycleStepFailureV1(value, 'cycle-1', 'target-entry')).toBe(value);
      expect(projectNativeTwoCycleCycleStepFailureV1(value)).toBeNull();
    },
  );

  it.each(['frontier-build', 'cleanup', 'cycle-2', null] as const)(
    'requires the matching coarse cycle, rejecting %s', phase => {
      const error = new Error();
      if (phase !== null) tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(error, phase);
      tagNativeTwoCycleCycleStepFailureV1(error, 'cycle-1', 'target-entry');
      expect(projectNativeTwoCycleCycleStepFailureV1(error)).toBeNull();
    },
  );

  it.each([
    ['unknown', 'target-entry'],
    ['cycle-1', 'unknown'],
    [null, 'target-entry'],
    ['cycle-1', null],
  ])('invalid tag arguments invalidate retained metadata %#', (cycle, step) => {
    const error = tagged();
    expect(tagNativeTwoCycleCycleStepFailureV1(
      error, cycle as 'cycle-1', step as NativeTwoCycleCycleStepV1,
    )).toBe(error);
    expect(projectNativeTwoCycleCycleStepFailureV1(error)).toBeNull();
  });

  it.each([
    ['cycle-1', 'setup-check'], ['cycle-2', 'target-entry'],
  ] as const)('fails closed on same-error retag contradiction %#', (cycle, step) => {
    const error = tagged();
    tagNativeTwoCycleCycleStepFailureV1(error, cycle, step);
    tagNativeTwoCycleCycleStepFailureV1(error, 'cycle-1', 'target-entry');
    expect(projectNativeTwoCycleCycleStepFailureV1(error)).toBeNull();
  });

  it('preserves primary detail through cleanup aggregation and duplicate references', () => {
    const primary = tagged();
    const cleanup = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(new Error(), 'cleanup');
    const aggregate = new AggregateError([primary, cleanup, new AggregateError([cleanup])]);
    const before = projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(aggregate);
    expect(projectNativeTwoCycleCycleStepFailureV1(aggregate)).toEqual({
      cycle: 'cycle-1', step: 'target-entry',
    });
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(aggregate)).toEqual(before);
  });

  it('supports a primary that is itself an existing aggregate without mutation', () => {
    const errors = [new Error(), new Error()];
    const primary = new AggregateError(errors);
    tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, 'cycle-2');
    expect(tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-2', 'tracker-check')).toBe(primary);
    expect(projectNativeTwoCycleCycleStepFailureV1(primary)).toEqual({
      cycle: 'cycle-2', step: 'tracker-check',
    });
    expect(primary.errors).toEqual(errors);
  });

  it('never projects cleanup-only metadata or borrows another primary cycle', () => {
    const cleanup = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(new Error(), 'cleanup');
    tagNativeTwoCycleCycleStepFailureV1(cleanup, 'cycle-1', 'target-entry');
    expect(projectNativeTwoCycleCycleStepFailureV1(cleanup)).toBeNull();
    const primary = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(new Error(), 'cycle-1');
    expect(projectNativeTwoCycleCycleStepFailureV1(new AggregateError([primary, cleanup]))).toBeNull();
  });

  it.each(['cleanup', 'untagged'] as const)(
    'never borrows a child cycle for an aggregate whose own coarse tag is %s', ownPhase => {
      const child = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(new Error(), 'cycle-1');
      const aggregate = new AggregateError([child]);
      if (ownPhase === 'cleanup') tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(aggregate, 'cleanup');
      tagNativeTwoCycleCycleStepFailureV1(aggregate, 'cycle-1', 'tracker-check');
      expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(aggregate)?.primaryPhase).toBe('cycle-1');
      expect(projectNativeTwoCycleCycleStepFailureV1(aggregate)).toBeNull();
    });

  it.each([
    ['cycle-1', 'setup-check'], ['cycle-2', 'target-entry'],
  ] as const)('rejects conflicting nested tags %#', (cycle, step) => {
    expect(projectNativeTwoCycleCycleStepFailureV1(new AggregateError([
      tagged(), new AggregateError([tagged(cycle, step)]),
    ]))).toBeNull();
  });

  it('accepts matching nested metadata but rejects a conflicting coarse phase', () => {
    expect(projectNativeTwoCycleCycleStepFailureV1(new AggregateError([tagged(), tagged()]))).toEqual({
      cycle: 'cycle-1', step: 'target-entry',
    });
    const otherPhase = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(new Error(), 'ergo-build');
    expect(projectNativeTwoCycleCycleStepFailureV1(new AggregateError([tagged(), otherPhase]))).toBeNull();
  });

  it('accepts exactly 64 inspected values, rejecting the next even after an early tag', () => {
    const primary = tagged();
    expect(projectNativeTwoCycleCycleStepFailureV1(new AggregateError([
      primary, ...Array.from({ length: 62 }, () => new Error()),
    ]))).toEqual({ cycle: 'cycle-1', step: 'target-entry' });
    expect(projectNativeTwoCycleCycleStepFailureV1(new AggregateError([
      primary, ...Array.from({ length: 63 }, () => new Error()),
    ]))).toBeNull();
    expect(projectNativeTwoCycleCycleStepFailureV1(new AggregateError([
      primary, ...Array.from({ length: 63 }, () => primary),
    ]))).toBeNull();
  });

  it('counts nested branches against the same bound', () => {
    const primary = tagged();
    const hiddenBranch = new AggregateError(Array.from({ length: 62 }, () => new Error()));
    expect(projectNativeTwoCycleCycleStepFailureV1(new AggregateError([primary, hiddenBranch]))).toBeNull();
  });

  it('rejects aggregate cycles while retaining the original error graph', () => {
    const self = new AggregateError([]);
    const children = [tagged(), self];
    Object.defineProperty(self, 'errors', { value: children });
    expect(projectNativeTwoCycleCycleStepFailureV1(self)).toBeNull();
    expect(self.errors).toBe(children);
    const first = new AggregateError([]);
    const second = new AggregateError([first]);
    Object.defineProperty(first, 'errors', { value: [tagged(), second] });
    expect(projectNativeTwoCycleCycleStepFailureV1(first)).toBeNull();
  });

  it('rejects direct, nested and revoked error proxies without invoking traps', () => {
    const error = tagged();
    const proxy = new Proxy(error, { getPrototypeOf() { throw new Error('trap'); } });
    expect(tagNativeTwoCycleCycleStepFailureV1(proxy, 'cycle-1', 'target-entry')).toBe(proxy);
    expect(projectNativeTwoCycleCycleStepFailureV1(proxy)).toBeNull();
    expect(projectNativeTwoCycleCycleStepFailureV1(new AggregateError([error, proxy]))).toBeNull();
    const revoked = Proxy.revocable(new AggregateError([error]), {});
    revoked.revoke();
    expect(projectNativeTwoCycleCycleStepFailureV1(revoked.proxy)).toBeNull();
    expect(projectNativeTwoCycleCycleStepFailureV1(new AggregateError([error, revoked.proxy]))).toBeNull();
  });

  it('rejects a proxy prototype before native coarse inspection', () => {
    const error = tagged();
    Object.setPrototypeOf(error, new Proxy(Error.prototype, {
      getPrototypeOf() { throw new Error('trap'); },
    }));
    expect(projectNativeTwoCycleCycleStepFailureV1(error)).toBeNull();
  });

  it.each(['errors', 'entry', 'iterator'] as const)(
    'rejects aggregate %s accessors without invoking them', kind => {
      const primary = tagged();
      const aggregate = new AggregateError([primary]);
      let reads = 0;
      const getter = () => { reads++; throw new Error('must not read'); };
      if (kind === 'errors') Object.defineProperty(aggregate, 'errors', { get: getter });
      if (kind === 'entry') Object.defineProperty(aggregate.errors, '0', { get: getter });
      if (kind === 'iterator') Object.defineProperty(aggregate.errors, Symbol.iterator, { get: getter });
      expect(projectNativeTwoCycleCycleStepFailureV1(aggregate)).toBeNull();
      expect(reads).toBe(0);
    },
  );

  it.each(['non-array', 'sparse', 'proxy-array', 'non-error', 'custom-prototype'] as const)(
    'rejects an incomplete aggregate graph: %s', kind => {
      const primary = tagged();
      const aggregate = new AggregateError([primary]);
      let children: unknown = [primary];
      if (kind === 'non-array') children = {};
      if (kind === 'sparse') { children = [primary, new Error()]; delete (children as unknown[])[1]; }
      if (kind === 'proxy-array') children = new Proxy([primary], {});
      if (kind === 'non-error') children = [primary, 'untrusted value'];
      if (kind === 'custom-prototype') Object.setPrototypeOf(children, {});
      Object.defineProperty(aggregate, 'errors', { value: children });
      expect(projectNativeTwoCycleCycleStepFailureV1(aggregate)).toBeNull();
    },
  );
});
