import { describe, expect, it } from 'vitest';

import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_STARTUP_PHASES_V1,
} from './relayer-core/substrate-federated-isolated-devnet-managed-campaign-phase-v1.js';
import {
  projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1,
  tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1,
} from './substrate-federated-native-two-cycle-root-phase-v1.js';
import {
  projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2,
  tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2,
} from './substrate-federated-native-two-cycle-root-phase-v2.js';

describe('native two-cycle root failure phases V2', () => {
  it.each(SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_STARTUP_PHASES_V1)(
    'preserves allowlisted Ergo startup phase %s on the original Error', startupPhase => {
      const failure = new Error('private startup detail');
      expect(tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(
        failure, 'node-start', startupPhase,
      )).toBe(failure);
      expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(failure)).toEqual({
        primaryPhase: 'node-start', cleanupErrorCount: 0,
        ergoNodeStartupPhase: startupPhase,
      });
      expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(failure)).toEqual({
        primaryPhase: 'node-start', cleanupErrorCount: 0,
      });
    },
  );

  it('retains the startup phase through cleanup aggregation without changing V1 projection', () => {
    const primary = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(
      new Error('private startup detail'), 'node-start', 'ergo node primary spawn',
    );
    const cleanup = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(
      new Error('private cleanup detail'), 'cleanup',
    );
    const aggregate = new AggregateError([primary, cleanup, new AggregateError([cleanup])]);
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(aggregate)).toEqual({
      primaryPhase: 'node-start', cleanupErrorCount: 1,
      ergoNodeStartupPhase: 'ergo node primary spawn',
    });
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(aggregate)).toEqual({
      primaryPhase: 'node-start', cleanupErrorCount: 1,
    });
  });

  it('does not attach or project startup detail outside node-start or without a tagged Error', () => {
    const nonNodeStart = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(
      new Error('private detail'), 'ergo-build', 'ergo node primary spawn',
    );
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(nonNodeStart)).toEqual({
      primaryPhase: 'ergo-build', cleanupErrorCount: 0, ergoNodeStartupPhase: null,
    });
    expect(tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(
      'thrown primitive', 'node-start', 'ergo node primary spawn',
    )).toBe('thrown primitive');
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2('thrown primitive')).toBeNull();
    const untagged = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(
      new Error('private detail'), 'node-start',
    );
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(untagged)).toEqual({
      primaryPhase: 'node-start', cleanupErrorCount: 0, ergoNodeStartupPhase: null,
    });
  });

  it('fails closed on conflicting startup or root phases', () => {
    const first = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(
      new Error('first'), 'node-start', 'ergo node primary spawn',
    );
    tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(
      first, 'node-start', 'ergo node witness spawn',
    );
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(first)).toEqual({
      primaryPhase: 'node-start', cleanupErrorCount: 0, ergoNodeStartupPhase: null,
    });
    const otherRoot = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(
      new Error('other'), 'cycle-1',
    );
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(
      new AggregateError([first, otherRoot]),
    )).toEqual({ primaryPhase: null, cleanupErrorCount: 0, ergoNodeStartupPhase: null });
  });

  it('bounds cyclic and oversized AggregateError traversal', () => {
    const nested: unknown[] = [];
    const cycle = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(
      new AggregateError([]), 'node-start',
    );
    const startup = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(
      new Error('private detail'), 'node-start', 'ergo node primary spawn',
    );
    nested.push(cycle, startup);
    Object.defineProperty(cycle, 'errors', { value: nested });
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(cycle)).toMatchObject({
      ergoNodeStartupPhase: 'ergo node primary spawn',
    });

    const children = Array.from({ length: 63 }, () => new Error('private filler'));
    children.push(startup);
    const oversized = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(
      new AggregateError(children), 'node-start',
    );
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(oversized)).toEqual({
      primaryPhase: 'node-start', cleanupErrorCount: 0, ergoNodeStartupPhase: null,
    });
  });

  it('does not claim an early startup phase when an oversized aggregate hides later branches', () => {
    const startup = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(
      new Error('private detail'), 'node-start', 'ergo node primary spawn',
    );
    const oversized = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(
      new AggregateError([startup, ...Array.from({ length: 64 }, () => 'untrusted value')]),
      'node-start',
    );
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(oversized)).toEqual({
      primaryPhase: 'node-start', cleanupErrorCount: 0, ergoNodeStartupPhase: null,
    });
  });

  it('preserves the primary value when hostile Error or aggregate inspection fails', () => {
    const revoked = Proxy.revocable(new Error('private'), {});
    revoked.revoke();
    expect(tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(
      revoked.proxy, 'node-start', 'ergo node primary spawn',
    )).toBe(revoked.proxy);
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(revoked.proxy)).toBeNull();

    const aggregate = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(
      new AggregateError([]), 'node-start', 'ergo node primary spawn',
    );
    Object.defineProperty(aggregate, 'errors', { get() { throw new Error('private getter'); } });
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(aggregate)).toEqual({
      primaryPhase: 'node-start', cleanupErrorCount: 0, ergoNodeStartupPhase: null,
    });
  });

  it('fails closed when a nested revoked Error proxy hides a conflicting startup phase', () => {
    const known = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(
      new Error('private known startup failure'), 'node-start', 'ergo node primary spawn',
    );
    const hidden = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(
      new Error('private hidden startup failure'), 'node-start', 'ergo node witness spawn',
    );
    const revoked = Proxy.revocable(new AggregateError([hidden]), {});
    const hostile = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(
      new AggregateError([known, revoked.proxy]), 'node-start',
    );
    revoked.revoke();
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(hostile)).toEqual({
      primaryPhase: 'node-start', cleanupErrorCount: 0, ergoNodeStartupPhase: null,
    });
  });
});
