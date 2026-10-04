import { describe, expect, it } from 'vitest';

import {
  ISOLATED_ERGO_NODE_POST_CALLBACK_STAGES_V1,
  projectNativeTwoCycleErgoNodePostCallbackStageV1 as project,
  projectOwnIsolatedErgoNodePostCallbackStageV1 as own,
  tagIsolatedErgoNodePostCallbackStageV1 as tag,
} from './substrate-federated-isolated-devnet-ergo-node-post-callback-stage-v1.js';
import { tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2 as root }
  from './substrate-federated-native-two-cycle-root-phase-v2.js';
import { tagNativeTwoCycleCycleStepFailureV1 as step }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';

function cycleSummary(error: Error): Error {
  root(error, 'cycle-1');
  step(error, 'cycle-1', 'cycle-summary');
  return error;
}

describe('Ergo owner post-callback failure provenance', () => {
  it.each(ISOLATED_ERGO_NODE_POST_CALLBACK_STAGES_V1)(
    'projects the exact owner failure at %s through root and cycle step', stage => {
      const primary = cycleSummary(tag(new Error('private cause'), stage));
      expect(own(primary)).toBe(stage);
      expect(project(primary)).toBe(stage);
      expect(project(new AggregateError([primary, root(new Error('cleanup'), 'cleanup')])))
        .toBe(stage);
      expect(project(new Error('private cause'))).toBeNull();
      expect(own(structuredClone(primary))).toBeNull();
    });

  it('does not borrow the cycle, summary or owner tag from an unrelated error', () => {
    const owner = tag(new Error('private'), 'completion-check');
    expect(project(owner)).toBeNull();
    expect(project(cycleSummary(new Error('other')))).toBeNull();
    root(owner, 'cycle-2'); step(owner, 'cycle-2', 'cycle-summary');
    expect(project(owner)).toBeNull();
    const wrongStep = tag(new Error('private'), 'mining-shutdown');
    root(wrongStep, 'cycle-1'); step(wrongStep, 'cycle-1', 'target-exit');
    expect(project(wrongStep)).toBeNull();
  });

  it('rejects conflicts and non-Error values without changing their identity', () => {
    const primary = cycleSummary(new Error('private'));
    expect(tag(primary, 'completion-check')).toBe(primary);
    expect(tag(primary, 'mining-shutdown')).toBe(primary);
    expect(own(primary)).toBeNull();
    expect(project(primary)).toBeNull();
    const plain = Object.freeze({ message: 'private' });
    expect(tag(plain, 'completion-check')).toBe(plain);
    expect(own(plain)).toBeNull();
    const invalid = cycleSummary(new Error('invalid stage'));
    tag(invalid, 'not-a-stage' as typeof ISOLATED_ERGO_NODE_POST_CALLBACK_STAGES_V1[number]);
    expect(project(invalid)).toBeNull();
  });

  it('rejects owner tags from secondary, cleanup and shared aggregate branches', () => {
    const first = cycleSummary(new Error('first'));
    const second = cycleSummary(tag(new Error('second'), 'read-only-restart'));
    expect(project(new AggregateError([first, second]))).toBeNull();
    const shared = cycleSummary(tag(new Error('shared'), 'completion-check'));
    expect(project(new AggregateError([shared, shared]))).toBeNull();
    const cleanup = root(tag(new Error('cleanup'), 'read-only-validation'), 'cleanup');
    expect(project(new AggregateError([first, cleanup]))).toBeNull();
    const duplicated = cycleSummary(tag(new Error('first owner'), 'completion-check'));
    const other = cycleSummary(tag(new Error('second owner'), 'mining-shutdown'));
    expect(project(new AggregateError([duplicated, other]))).toBeNull();
  });

  it('rejects cyclic, oversized and accessor-bearing aggregate graphs', () => {
    const primary = cycleSummary(tag(new Error('private'), 'completion-check'));
    const cyclic = new AggregateError([primary]);
    (cyclic.errors as unknown[]).push(cyclic);
    expect(project(cyclic)).toBeNull();
    expect(project(new AggregateError([primary, ...Array.from({ length: 65 }, () => new Error())])))
      .toBeNull();
    const accessor = new AggregateError([primary]);
    Object.defineProperty(accessor, 'errors', { get: () => [primary] });
    expect(project(accessor)).toBeNull();
    const iterator = new AggregateError([primary]);
    Object.defineProperty(iterator.errors, Symbol.iterator, { value: () => [primary] });
    expect(project(iterator)).toBeNull();
  });
});
