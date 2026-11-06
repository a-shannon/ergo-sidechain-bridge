import { describe, expect, it } from 'vitest';
import { NATIVE_GENESIS_SETUP_FAILURE_STAGES_V1, tagNativeGenesisSetupFailureStageV1 as tag,
  projectOwnNativeGenesisSetupFailureStageV1 as own, projectNativeTwoCycleSetupFailureStageV1 as project }
  from './substrate-federated-native-genesis-setup-stage-v1.js';
import { tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 as phase }
  from './substrate-federated-native-two-cycle-root-phase-v1.js';
import { tagNativeTwoCycleCycleStepFailureV1 as step, projectOwnNativeTwoCycleCycleStepFailureV1 }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';

function primary() {
  return step(phase(new Error('private cause'), 'cycle-1'), 'cycle-1', 'setup-check');
}
describe('native setup operation failure projection', () => {
  it.each(NATIVE_GENESIS_SETUP_FAILURE_STAGES_V1)('retains original frozen Error for %s', stage => {
    const error = Object.freeze(primary());
    expect(tag(error, stage)).toBe(error); expect(tag(error, stage)).toBe(error);
    expect(own(error)).toBe(stage); expect(project(error)).toBe(stage);
    expect(Object.keys(error)).toEqual([]);
  });
  it('keeps the stage on the primary through separately tagged cleanup aggregation', () => {
    const error = tag(primary(), 'wasm-signing');
    const cleanup = phase(new Error('private disposal'), 'cleanup');
    expect(project(new AggregateError([error, cleanup], 'private aggregate'))).toBe('wasm-signing');
  });
  it.each(['untagged', 'wrong cycle', 'wrong step', 'cleanup', 'stage conflict', 'invalid stage',
    'two primaries', 'cleanup borrowing', 'ancestor borrowing', 'descendant borrowing', 'step conflict'] as const)(
    'rejects %s attribution', fault => {
      const candidate = fault === 'untagged' ? primary() : tag(primary(), 'wasm-signing');
      let value: unknown = candidate;
      if (fault === 'wrong cycle') value = tag(step(phase(new Error(), 'cycle-2'), 'cycle-2', 'setup-check'), 'wasm-signing');
      if (fault === 'wrong step') value = tag(step(phase(new Error(), 'cycle-1'), 'cycle-1', 'tracker-check'), 'wasm-signing');
      if (fault === 'cleanup') value = tag(step(phase(new Error(), 'cleanup'), 'cycle-1', 'setup-check'), 'wasm-signing');
      if (fault === 'stage conflict') tag(candidate, 'signing-context');
      if (fault === 'invalid stage') tag(candidate, 'unknown' as never);
      if (fault === 'two primaries') value = new AggregateError([candidate, tag(primary(), 'wasm-signing')]);
      if (fault === 'cleanup borrowing') value = new AggregateError([primary(), tag(phase(new Error(), 'cleanup'), 'wasm-signing')]);
      if (fault === 'ancestor borrowing') value = tag(phase(new AggregateError([primary()]), 'cycle-1'), 'wasm-signing');
      if (fault === 'descendant borrowing') value = step(phase(new AggregateError([tag(new Error(), 'wasm-signing')]), 'cycle-1'), 'cycle-1', 'setup-check');
      if (fault === 'step conflict') step(candidate, 'cycle-1', 'tracker-check');
      expect(project(value)).toBeNull();
    });
  it.each(['cleanup root', 'cleanup sibling', 'shared before cleanup', 'shared after cleanup',
    'shared aggregate before cleanup', 'shared aggregate after cleanup'] as const)(
    'rejects stage detail beneath a %s even when the child has its own valid tags', fault => {
      const stale = tag(primary(), 'wasm-signing');
      const shared = fault.startsWith('shared aggregate') ? new AggregateError([stale]) : stale;
      const cleanup = phase(new AggregateError([shared]), 'cleanup');
      const value = fault === 'cleanup root' ? cleanup : fault === 'cleanup sibling'
        ? new AggregateError([primary(), cleanup]) : fault.includes('before cleanup')
          ? new AggregateError([shared, cleanup]) : new AggregateError([cleanup, shared]);
      expect(project(value)).toBeNull();
    });
  it.each(['proxy', 'getter', 'iterator', 'sparse', 'primitive', 'cycle', 'oversize', 'hostile prototype'] as const)(
    'rejects complete unsafe %s graph without side effects', fault => {
      let calls = 0; const error = tag(primary(), 'request-validation');
      let value: unknown = error;
      const children: unknown[] = [error];
      if (fault === 'proxy') value = new Proxy(error, { get() { calls++; throw new Error(); } });
      else if (fault === 'hostile prototype') {
        Object.setPrototypeOf(error, new Proxy(Error.prototype, { getPrototypeOf() { calls++; throw new Error(); } }));
      } else {
        const aggregate = new AggregateError(children); value = aggregate;
        const stored = Object.getOwnPropertyDescriptor(aggregate, 'errors')!.value as unknown[];
        if (fault === 'getter') Object.defineProperty(aggregate, 'errors', { get() { calls++; throw new Error(); } });
        if (fault === 'iterator') Object.defineProperty(stored, Symbol.iterator, { value() { calls++; throw new Error(); } });
        if (fault === 'sparse') stored.length = 2;
        if (fault === 'primitive') stored.push(null);
        if (fault === 'cycle') stored.push(aggregate);
        if (fault === 'oversize') stored.push(...Array.from({ length: 64 }, () => phase(new Error(), 'cleanup')));
      }
      expect(project(value)).toBeNull(); expect(calls).toBe(0);
    });
  it('never reconstructs metadata from serialized errors or error messages', () => {
    const source = tag(primary(), 'tracker-node-check');
    expect(own(new Error(source.message))).toBeNull(); expect(own(JSON.parse('{}'))).toBeNull();
    expect(projectOwnNativeTwoCycleCycleStepFailureV1(new AggregateError([source]))).toBeNull();
  });
});
