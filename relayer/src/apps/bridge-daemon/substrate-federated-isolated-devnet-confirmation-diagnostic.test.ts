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
