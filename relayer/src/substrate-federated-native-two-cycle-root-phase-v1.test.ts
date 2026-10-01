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
});
