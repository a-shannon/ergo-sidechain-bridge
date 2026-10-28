import { describe, expect, it } from 'vitest';

import {
  SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_ROOT_PHASES_V1,
  projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1,
  projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1,
  tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1,
} from './substrate-federated-native-two-cycle-root-phase-v1.js';

describe('native two-cycle root failure phases', () => {
  it('reads only the own coarse tag without traversing children or errors accessors', () => {
    const child = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error(), 'cycle-1');
    const aggregate = new AggregateError([child]);
    expect(projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBeNull();
    tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate, 'cleanup');
    Object.defineProperty(aggregate, 'errors', { get() { throw new Error('must not traverse'); } });
    expect(projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBe('cleanup');
    expect(projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(child)).toBe('cycle-1');
    expect(projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1('unknown')).toBeNull();
  });
  it('freezes the exact bounded phase vocabulary', () => {
    expect(SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_ROOT_PHASES_V1).toEqual([
      'setup-and-custody', 'frontier-build', 'ergo-build', 'node-start',
      'cycle-1', 'between-cycles', 'cycle-2', 'cleanup',
    ]);
    expect(Object.isFrozen(SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_ROOT_PHASES_V1)).toBe(true);
  });

  it('preserves error identity and the first producer tag', () => {
    const failure = new Error('private failure detail');
    expect(tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(failure, 'frontier-build')).toBe(failure);
    expect(tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(failure, 'cleanup')).toBe(failure);
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(failure)).toEqual({
      primaryPhase: 'frontier-build', cleanupErrorCount: 0,
    });
  });

  it('projects the primary phase and unique cleanup exceptions through the existing aggregate shape', () => {
    const primary = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error('primary'), 'cycle-1');
    const cleanupA = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error('cleanup A'), 'cleanup');
    const cleanupB = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error('cleanup B'), 'cleanup');
    const aggregate = new AggregateError([primary, cleanupA, cleanupA, new AggregateError([cleanupB])]);
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toEqual({
      primaryPhase: 'cycle-1', cleanupErrorCount: 2,
    });
    expect(aggregate.errors).toEqual([primary, cleanupA, cleanupA, expect.any(AggregateError)]);
  });

  it('reports cleanup-only failure without promoting cleanup to the primary phase', () => {
    const cleanup = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error('cleanup'), 'cleanup');
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(cleanup)).toEqual({
      primaryPhase: null, cleanupErrorCount: 1,
    });
  });

  it('fails closed on conflicting primary tags and ignores untagged or non-Error values', () => {
    const first = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error('first'), 'cycle-1');
    const second = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error('second'), 'cycle-2');
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new AggregateError([first, second])))
      .toEqual({ primaryPhase: null, cleanupErrorCount: 0 });
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new AggregateError([new Error('untagged')]))).toBeNull();
    expect(tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1('thrown string', 'node-start')).toBe('thrown string');
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1('thrown string')).toBeNull();
  });

  it('does not replace a thrown value when hostile Error introspection fails', () => {
    const revocable = Proxy.revocable(new Error('private'), {});
    revocable.revoke();
    expect(tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(revocable.proxy, 'node-start')).toBe(revocable.proxy);
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(revocable.proxy)).toBeNull();
  });

  it('accepts exactly 64 values including the root and primitive members', () => {
    const aggregate = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new AggregateError([]), 'cycle-1');
    aggregate.errors = Array.from({ length: 63 }, (_, index) => index);
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toEqual({
      primaryPhase: 'cycle-1', cleanupErrorCount: 0,
    });
  });

  it.each([64, 65])('refuses %i primitive members before inspecting beyond the shared budget', (length) => {
    const aggregate = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new AggregateError([]), 'cycle-1');
    let reads = 0;
    const members = Array.from({ length }, () => 0);
    Object.defineProperty(members, 0, { get() { reads++; return 0; } });
    aggregate.errors = members;
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBeNull();
    expect(reads).toBe(0);
  });

  it('refuses a partial primary result when a later aggregate exceeds the remaining budget', () => {
    const primary = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error(), 'cycle-1');
    const conflict = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error(), 'cycle-2');
    const aggregate = new AggregateError([primary, ...Array.from({ length: 61 }, () => 0), new AggregateError([conflict])]);
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBeNull();
  });

  it('shares the member budget across aggregate branches', () => {
    const aggregate = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new AggregateError([
      new AggregateError(Array.from({ length: 31 }, () => 0)),
      new AggregateError(Array.from({ length: 31 }, () => 0)),
    ]), 'cycle-1');
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBeNull();
  });

  it('preserves unique cleanup counting and its 32-error cap within the traversal budget', () => {
    const cleanupErrors = Array.from({ length: 63 }, () =>
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error(), 'cleanup'));
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new AggregateError(cleanupErrors))).toEqual({
      primaryPhase: null, cleanupErrorCount: 32,
    });
  });

  it('terminates complete cycles and counts duplicate Error identities only once', () => {
    const primary = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error(), 'cycle-1');
    const cleanup = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error(), 'cleanup');
    const aggregate = new AggregateError([]);
    aggregate.errors = [aggregate, primary, cleanup, cleanup];
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toEqual({
      primaryPhase: 'cycle-1', cleanupErrorCount: 1,
    });
  });

  it('charges duplicate and cyclic members to the shared budget', () => {
    const aggregate = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new AggregateError([]), 'cycle-1');
    aggregate.errors = Array.from({ length: 64 }, () => aggregate);
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBeNull();
  });

  it('ignores an iterator override that would hide a conflicting indexed member', () => {
    const primary = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error(), 'cycle-1');
    const conflict = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error(), 'cycle-2');
    const aggregate = new AggregateError([primary, conflict]);
    let iteratorCalls = 0;
    Object.defineProperty(aggregate.errors, Symbol.iterator, {
      value: function* () { iteratorCalls++; yield primary; },
    });
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toEqual({
      primaryPhase: null, cleanupErrorCount: 0,
    });
    expect(iteratorCalls).toBe(0);
  });

  it('does not access a custom array iterator getter', () => {
    const primary = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error(), 'cycle-1');
    const aggregate = new AggregateError([primary]);
    let iteratorReads = 0;
    Object.defineProperty(aggregate.errors, Symbol.iterator, {
      get() { iteratorReads++; throw new Error('iterator getter'); },
    });
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toEqual({
      primaryPhase: 'cycle-1', cleanupErrorCount: 0,
    });
    expect(iteratorReads).toBe(0);
  });

  it('refuses a malformed aggregate member collection despite an own primary tag', () => {
    const aggregate = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new AggregateError([]), 'cycle-1');
    aggregate.errors = {} as unknown as Error[];
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBeNull();
  });

  it('refuses a throwing aggregate errors getter despite an own primary tag', () => {
    const aggregate = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new AggregateError([]), 'cycle-1');
    Object.defineProperty(aggregate, 'errors', { get() { throw new Error('errors getter'); } });
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBeNull();
  });

  it('refuses a throwing indexed member getter despite an own primary tag', () => {
    const aggregate = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new AggregateError([0]), 'cycle-1');
    Object.defineProperty(aggregate.errors, 0, { get() { throw new Error('member getter'); } });
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBeNull();
  });

  it('refuses a throwing array length proxy despite an own primary tag', () => {
    const aggregate = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new AggregateError([]), 'cycle-1');
    aggregate.errors = new Proxy([], { get() { throw new Error('length trap'); } });
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBeNull();
  });

  it('refuses a revoked array proxy despite an own primary tag', () => {
    const aggregate = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new AggregateError([]), 'cycle-1');
    const revocable = Proxy.revocable([], {});
    aggregate.errors = revocable.proxy;
    revocable.revoke();
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBeNull();
  });

  it('refuses trapped nested Error introspection despite an own primary tag', () => {
    const aggregate = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new AggregateError([]), 'cycle-1');
    const revocable = Proxy.revocable(new Error(), {});
    aggregate.errors = [revocable.proxy];
    revocable.revoke();
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBeNull();
  });

  it('rejects a proxy array that hides a conflict behind a zero length without invoking its trap', () => {
    const primary = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error(), 'cycle-1');
    const conflict = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error(), 'cycle-2');
    const aggregate = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new AggregateError([]), 'cycle-1');
    let traps = 0;
    aggregate.errors = new Proxy([primary, conflict], {
      get(target, key) { traps++; return key === 'length' ? 0 : Reflect.get(target, key); },
    });
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBeNull();
    expect(traps).toBe(0);
  });

  it('rejects an indexed getter that would replace a later conflict and change length without invoking it', () => {
    const primary = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error(), 'cycle-1');
    const conflict = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error(), 'cycle-2');
    const aggregate = new AggregateError([primary, conflict]);
    let reads = 0;
    Object.defineProperty(aggregate.errors, 0, { get() {
      reads++;
      aggregate.errors[1] = primary;
      aggregate.errors.length = 1;
      return primary;
    } });
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBeNull();
    expect(reads).toBe(0);
    expect(aggregate.errors.length).toBe(2);
    expect(aggregate.errors[1]).toBe(conflict);
  });

  it('rejects an own errors getter that would return a partial graph without invoking it', () => {
    const primary = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error(), 'cycle-1');
    const conflict = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error(), 'cycle-2');
    const aggregate = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new AggregateError([primary, conflict]), 'cycle-1');
    let reads = 0;
    Object.defineProperty(aggregate, 'errors', { get() { reads++; return [primary]; } });
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBeNull();
    expect(reads).toBe(0);
  });

  it('rejects a proxy prototype that would hide AggregateError identity without invoking it', () => {
    const aggregate = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new AggregateError([]), 'cycle-1');
    let traps = 0;
    Object.setPrototypeOf(aggregate, new Proxy(AggregateError.prototype, {
      getPrototypeOf() { traps++; return Error.prototype; },
    }));
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBeNull();
    expect(traps).toBe(0);
  });

  it('rejects a direct Error proxy without invoking its prototype trap', () => {
    let traps = 0;
    const proxy = new Proxy(new Error(), { getPrototypeOf() { traps++; return Error.prototype; } });
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(proxy)).toBeNull();
    expect(traps).toBe(0);
  });

  it('rejects own errors on a non-aggregate Error or ordinary object', () => {
    const error = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error(), 'cycle-1');
    Object.defineProperty(error, 'errors', { value: [] });
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(error)).toBeNull();
    const aggregate = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new AggregateError([{ errors: [] }]), 'cycle-1');
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBeNull();
  });

  it('rejects holes and inherited numeric members', () => {
    const aggregate = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new AggregateError([]), 'cycle-1');
    aggregate.errors = new Array(1);
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBeNull();
    const inherited = Object.create(Array.prototype);
    inherited[0] = new Error();
    Object.setPrototypeOf(aggregate.errors, inherited);
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBeNull();
  });

  it('rejects an aggregate whose own errors data was removed', () => {
    const conflict = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error(), 'cycle-2');
    const aggregate = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(
      new AggregateError([conflict]), 'cycle-1');
    expect(Reflect.deleteProperty(aggregate, 'errors')).toBe(true);
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toBeNull();
  });

  it('refuses a prototype chain beyond the fixed inspection bound', () => {
    const error = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error(), 'cycle-1');
    let prototype: object = Object.getPrototypeOf(error);
    for (let index = 0; index < 64; index++) prototype = Object.create(prototype);
    Object.setPrototypeOf(error, prototype);
    expect(projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(error)).toBe('cycle-1');
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(error)).toBeNull();
  });

  it('preserves native Error and AggregateError subclasses with ordinary data members', () => {
    class PrimaryFailure extends Error {}
    class CombinedFailure extends AggregateError {}
    const primary = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new PrimaryFailure(), 'cycle-1');
    const cleanup = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new PrimaryFailure(), 'cleanup');
    const aggregate = new CombinedFailure([primary, cleanup, cleanup]);
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toEqual({
      primaryPhase: 'cycle-1', cleanupErrorCount: 1,
    });
    expect(projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(primary)).toBe('cycle-1');
  });
});
