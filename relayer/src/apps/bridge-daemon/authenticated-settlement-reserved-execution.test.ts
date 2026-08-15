import { describe, expect, it, vi } from 'vitest';

const core = vi.hoisted(() => ({
  execute: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock(
  '../../relayer-core/authenticated-settlement-execution-lifecycle.js',
  () => ({
    executeAuthenticatedSettlementReservedHandoff: core.execute,
    reconcileAuthenticatedSettlementSubmission: core.reconcile,
  }),
);

import {
  reconcileAuthenticatedSettlementSubmissionAttempt,
  runAuthenticatedSettlementReservedExecution,
} from './authenticated-settlement-reserved-execution.js';

describe('bridge-daemon authenticated settlement reserved execution', () => {
  it('assembles only the seven late-stage capabilities', async () => {
    const handoff = Object.freeze({ marker: 'reserved-handoff' });
    const result = Object.freeze({ marker: 'execution-result' });
    core.execute.mockResolvedValueOnce(result);
    const deps = {
      revalidateImmediately: vi.fn(),
      authorizeBroadcast: vi.fn(),
      reserveTransport: vi.fn(),
      submit: vi.fn(),
      finalizeSubmission: vi.fn(),
      observeConfirmation: vi.fn(),
      recordConfirmation: vi.fn(),
    };

    await expect(
      runAuthenticatedSettlementReservedExecution(handoff as never, deps),
    ).resolves.toBe(result);

    expect(core.execute).toHaveBeenCalledTimes(1);
    const [receivedHandoff, ports] = core.execute.mock.calls[0]!;
    expect(receivedHandoff).toBe(handoff);
    expect(Object.isFrozen(ports)).toBe(true);
    expect(Object.keys(ports)).toEqual([
      'immediateRevalidation',
      'broadcastAuthorization',
      'transportReservationJournal',
      'submitter',
      'submissionJournal',
      'confirmationObservation',
      'confirmationJournal',
    ]);
    expect('signer' in ports).toBe(false);
    expect('checker' in ports).toBe(false);
    expect('checkJournal' in ports).toBe(false);
    expect('executionReservationJournal' in ports).toBe(false);
    expect('fundsAuthority' in ports).toBe(false);
  });

  it('assembles restart observation and journal without any submit capability', async () => {
    const durable = Object.freeze({ marker: 'durable-attempt' });
    const result = Object.freeze({ marker: 'reconciliation-result' });
    core.reconcile.mockResolvedValueOnce(result);
    const deps = {
      observe: vi.fn(),
      record: vi.fn(),
    };

    await expect(
      reconcileAuthenticatedSettlementSubmissionAttempt(
        durable as never,
        deps,
      ),
    ).resolves.toBe(result);

    expect(core.reconcile).toHaveBeenCalledTimes(1);
    const [receivedDurable, ports] = core.reconcile.mock.calls[0]!;
    expect(receivedDurable).toBe(durable);
    expect(Object.isFrozen(ports)).toBe(true);
    expect(Object.keys(ports)).toEqual(['observation', 'journal']);
    expect('submitter' in ports).toBe(false);
    expect('broadcastAuthorization' in ports).toBe(false);
    expect('transportReservationJournal' in ports).toBe(false);
    expect('fundsAuthority' in ports).toBe(false);
  });
});
