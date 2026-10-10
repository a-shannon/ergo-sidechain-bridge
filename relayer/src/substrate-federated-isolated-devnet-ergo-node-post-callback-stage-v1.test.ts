import { describe, expect, it } from 'vitest';

import {
  ISOLATED_ERGO_NODE_COMPLETION_FAILURE_REASONS_V1,
  ISOLATED_ERGO_NODE_POST_CALLBACK_STAGES_V1,
  projectNativeTwoCycleErgoNodeCompletionFailureReasonV1 as projectCompletionReason,
  projectNativeTwoCycleErgoNodePostCallbackStageV1 as project,
  projectOwnIsolatedErgoNodeCompletionFailureReasonV1 as ownCompletionReason,
  projectOwnIsolatedErgoNodePostCallbackStageV1 as own,
  tagIsolatedErgoNodeCompletionFailureReasonV1 as tagCompletionReason,
  tagIsolatedErgoNodePostCallbackStageV1 as tag,
  transferIsolatedErgoNodeCompletionFailureReasonV1 as transferCompletionReason,
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

function completionFailure(
  error: Error,
  reason: typeof ISOLATED_ERGO_NODE_COMPLETION_FAILURE_REASONS_V1[number],
): Error {
  tag(error, 'completion-check');
  tagCompletionReason(error, reason);
  return cycleSummary(error);
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

  it('projects a completion reason only when it shares the owner error with its stage', () => {
    const owner = new Error('private completion cause');
    tag(owner, 'completion-check');
    tagCompletionReason(owner, 'invalid-timing');
    const summary = cycleSummary(owner);

    expect(own(owner)).toBe('completion-check');
    expect(ownCompletionReason(owner)).toBe('invalid-timing');
    expect(project(summary)).toBe('completion-check');
    expect(projectCompletionReason(summary)).toBe('invalid-timing');

    const missing = cycleSummary(tag(new Error('missing reason'), 'completion-check'));
    expect(project(missing)).toBe('completion-check');
    expect(projectCompletionReason(missing)).toBeNull();

    const unknown = tag(new Error('unknown reason'), 'completion-check');
    tagCompletionReason(
      unknown,
      'unknown' as typeof ISOLATED_ERGO_NODE_COMPLETION_FAILURE_REASONS_V1[number],
    );
    const unknownSummary = cycleSummary(unknown);
    expect(ownCompletionReason(unknown)).toBeNull();
    expect(projectCompletionReason(unknownSummary)).toBeNull();

    const conflicting = tag(new Error('conflicting reason'), 'completion-check');
    tagCompletionReason(conflicting, 'invalid-timing');
    tagCompletionReason(conflicting, 'budget-exceeded');
    const conflictingSummary = cycleSummary(conflicting);
    expect(ownCompletionReason(conflicting)).toBeNull();
    expect(project(conflictingSummary)).toBe('completion-check');
    expect(projectCompletionReason(conflictingSummary)).toBeNull();
  });

  it('rejects completion reasons borrowed across primary, secondary, cleanup and bounded graph paths', () => {
    const primaryOwner = tag(new Error('primary owner'), 'completion-check');
    const borrowedByPrimary = tagCompletionReason(
      new AggregateError([primaryOwner]),
      'invalid-timing',
    );
    expect(projectCompletionReason(cycleSummary(borrowedByPrimary))).toBeNull();

    const secondary = completionFailure(new Error('secondary owner'), 'budget-exceeded');
    expect(projectCompletionReason(
      cycleSummary(new AggregateError([new Error('unrelated primary'), secondary])),
    )).toBeNull();

    const cleanup = new Error('cleanup owner');
    tag(cleanup, 'completion-check');
    tagCompletionReason(cleanup, 'invalid-timing');
    root(cleanup, 'cleanup');
    expect(projectCompletionReason(cycleSummary(new AggregateError([cleanup])))).toBeNull();

    const duplicate = completionFailure(new Error('duplicate owner'), 'budget-exceeded');
    expect(projectCompletionReason(new AggregateError([duplicate, duplicate]))).toBeNull();

    const oversized = completionFailure(new Error('oversized owner'), 'invalid-timing');
    expect(projectCompletionReason(new AggregateError([
      oversized,
      ...Array.from({ length: 65 }, () => new Error('unrelated')),
    ]))).toBeNull();
  });

  it.each(ISOLATED_ERGO_NODE_COMPLETION_FAILURE_REASONS_V1)(
    'preserves %s on the exact cleanup aggregate without borrowing from its primary child', reason => {
      const predicate = tagCompletionReason(new Error('private predicate'), reason);
      const cleanup = new Error('private cleanup');
      const final = cycleSummary(tag(new AggregateError([predicate, cleanup]),
        'completion-check'));
      expect(project(final)).toBe('completion-check');
      expect(projectCompletionReason(final)).toBeNull();
      expect(transferCompletionReason(predicate, final)).toBe(final);
      expect(ownCompletionReason(predicate)).toBeNull();
      expect(ownCompletionReason(final)).toBe(reason);
      expect(projectCompletionReason(final)).toBe(reason);
      expect((final as AggregateError).errors).toEqual([predicate, cleanup]);
    });

  it('refuses reason transfer to a secondary, absent, or malformed cleanup ancestry', () => {
    const predicate = tagCompletionReason(new Error('private predicate'), 'budget-exceeded');
    const cleanup = new Error('private cleanup');
    const wrongOrder = cycleSummary(tag(new AggregateError([cleanup, predicate]),
      'completion-check'));
    expect(transferCompletionReason(predicate, wrongOrder)).toBe(wrongOrder);
    expect(ownCompletionReason(predicate)).toBe('budget-exceeded');
    expect(projectCompletionReason(wrongOrder)).toBeNull();

    const missing = cycleSummary(tag(new AggregateError([predicate]), 'completion-check'));
    expect(transferCompletionReason(predicate, missing)).toBe(missing);
    expect(ownCompletionReason(predicate)).toBe('budget-exceeded');
    expect(projectCompletionReason(missing)).toBeNull();

    const unrelated = cycleSummary(tag(new Error('unrelated'), 'completion-check'));
    expect(transferCompletionReason(predicate, unrelated)).toBe(unrelated);
    expect(ownCompletionReason(predicate)).toBe('budget-exceeded');
    expect(projectCompletionReason(unrelated)).toBeNull();
  });
});
