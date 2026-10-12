import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  waitForCanonicalConfirmation,
  projectTrackerCanonicalConfirmationFailureDiagnosticV1 as projectFailure,
} from './substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';

const txId = '11'.repeat(32);
const targetId = '22'.repeat(32);
const observerSchema = 'e2s.substrate-federated-isolated-devnet-genesis-confirmation-observer.v1' as const;

afterEach(() => vi.restoreAllMocks());

describe('canonical confirmation diagnostic projection without node execution', () => {
  const confirmed = Object.freeze({ status: 'confirmed' as const, confirmations: 10, observedAtHeight: 31,
    confirmationHeight: 21, confirmationHeaderIdHex: '44'.repeat(32), observationDigestHex: '33'.repeat(32),
    observerArtifact: Object.freeze({ role: 'synthetic confirmation artifact' }) });
  const makeObserver = () => ({ schema: observerSchema, reconciliationIdentityDigestHex: targetId,
    observe: vi.fn(async () => confirmed) });

  it.each([5_000, 240_000])('forwards the original bounded deadline %s to the completion guard', async completionDeadline => {
    let now = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const observer = makeObserver();
    const hook = vi.fn(async (deadline: number) => {
      expect(deadline).toBe(Math.min(completionDeadline, 120_100));
      now = 200;
    });
    await expect(waitForCanonicalConfirmation(observer, txId, completionDeadline, 'native', undefined, hook))
      .resolves.toMatchObject(confirmed);
    expect(hook).toHaveBeenCalledOnce();
    expect(observer.observe).toHaveBeenCalledOnce();
  });

  it('keeps a completion failure as the original thrown value without observing again', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(100);
    const observer = makeObserver();
    const cause = Object.freeze({ role: 'synthetic permit failure' });
    const hook = vi.fn(async () => { throw cause; });
    await expect(waitForCanonicalConfirmation(observer, txId, 5_000, 'native', undefined, hook)).rejects.toBe(cause);
    expect(hook).toHaveBeenCalledOnce();
    expect(observer.observe).toHaveBeenCalledOnce();
  });

  it.each([NaN, Infinity, -1, 5_000, 5_001])('rejects completion clock %s after the hook', async after => {
    let now = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const observer = makeObserver();
    const hook = vi.fn(async () => { now = after; });
    const error = await waitForCanonicalConfirmation(observer, txId, 5_000, 'native', undefined, hook).catch(value => value);
    expect(projectFailure(error)?.category).toBe(!Number.isFinite(after) || after < 100
      ? 'clock_failure' : 'observation_completed_after_deadline');
    expect(observer.observe).toHaveBeenCalledOnce();
    expect(hook).toHaveBeenCalledOnce();
  });

  it('rechecks active custody after a pending completion hook', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(100);
    const observer = makeObserver();
    let active = true;
    let entered!: () => void;
    let finish!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const assertActive = () => { if (!active) throw new Error('synthetic custody revoked'); };
    const pending = waitForCanonicalConfirmation(observer, txId, 5_000, 'native', assertActive,
      async () => { entered(); await gate; });
    const outcome = pending.then(value => ({ value }), error => ({ error }));
    await Promise.race([enteredPromise, outcome.then(result => { if ('error' in result) throw result.error; })]);
    active = false;
    finish();
    expect((await outcome as { error: Error }).error.message).toBe('synthetic custody revoked');
    expect(observer.observe).toHaveBeenCalledOnce();
  });

  it.each([null, false, 0, {}, 'hook'])('rejects invalid completion guard %s before observation', async hook => {
    const observer = makeObserver();
    await expect(waitForCanonicalConfirmation(observer, txId, 5_000, 'native', undefined, hook as never))
      .rejects.toThrow('completion guard is invalid');
    expect(observer.observe).not.toHaveBeenCalled();
  });

  it.each(['pending', 'not_found'] as const)('does not invoke completion on a %s deadline', async status => {
    let now = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const observer = { schema: observerSchema, reconciliationIdentityDigestHex: targetId,
      observe: vi.fn(async () => { now = 5_000; return { ...confirmed, status, confirmations: 0,
        confirmationHeight: null, confirmationHeaderIdHex: null }; }) };
    const hook = vi.fn();
    const error = await waitForCanonicalConfirmation(observer, txId, 5_000, 'native', undefined, hook).catch(value => value);
    expect(projectFailure(error)?.category).toBe(`${status}_at_deadline`);
    expect(hook).not.toHaveBeenCalled();
  });

  it('declines a revoked proxy in an aggregate primary list without throwing', () => {
    const revoked = Proxy.revocable([], {});
    revoked.revoke();
    const failure = new AggregateError([], 'synthetic');
    Object.defineProperty(failure, 'errors', { value: revoked.proxy });
    expect(projectFailure(failure)).toBeNull();
  });
  it.each(['pending', 'not_found', 'observer_failure'] as const)(
    'retains the real %s polling result without opaque observer content', async mode => {
      let now = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      const observe = vi.fn(async () => {
        now = 120_001;
        if (mode === 'observer_failure') throw new Error('synthetic-private-observer-error');
        return { status: mode, confirmations: 0, observedAtHeight: 10,
          confirmationHeight: null, confirmationHeaderIdHex: null,
          observationDigestHex: '33'.repeat(32), observerArtifact: { opaque: 'synthetic-private-artifact' } };
      });
      const observer = { schema: observerSchema, reconciliationIdentityDigestHex: targetId, observe };
      const failure = await waitForCanonicalConfirmation(observer, txId, 240_000, 'source-lock').catch(error => error);
      const diagnostic = projectFailure(failure)!;
      expect(diagnostic.category).toBe(mode === 'observer_failure' ? mode : `${mode}_at_deadline`);
      expect(diagnostic.expectedTransactionIdHex).toBe(txId);
      expect(diagnostic.executionTargetIdentityDigestHex).toBe(targetId);
      expect(diagnostic.observationCount).toBe(1);
      expect(diagnostic.lastObservation).toEqual(mode === 'observer_failure' ? null : {
        status: mode, confirmations: 0, observedAtHeight: 10, observationDigestHex: '33'.repeat(32),
      });
      expect(observe).toHaveBeenCalledOnce();
      expect(Object.isFrozen(diagnostic)).toBe(true);
      expect(JSON.stringify(diagnostic)).not.toContain('synthetic-private');
      expect(projectFailure(structuredClone(diagnostic))).toBeNull();
      expect(projectFailure(new AggregateError([failure, new Error('cleanup')]))).toBe(diagnostic);
      expect(projectFailure(new AggregateError([new Error('primary'), failure]))).toBeNull();
    },
  );
});
