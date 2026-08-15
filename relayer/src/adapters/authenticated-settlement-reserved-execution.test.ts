import { describe, expect, it, vi } from 'vitest';

import type {
  AuthenticatedSettlementReservedExecutionPorts,
  AuthenticatedSettlementRestartReconciliationPorts,
} from '../relayer-core/authenticated-settlement-execution-lifecycle.js';
import {
  createAuthenticatedSettlementBroadcastAuthorizationAdapter,
  createAuthenticatedSettlementConfirmationJournalAdapter,
  createAuthenticatedSettlementConfirmationObservationAdapter,
  createAuthenticatedSettlementImmediateRevalidationAdapter,
  createAuthenticatedSettlementRestartJournalAdapter,
  createAuthenticatedSettlementRestartObservationAdapter,
  createAuthenticatedSettlementSubmissionJournalAdapter,
  createAuthenticatedSettlementSubmitterAdapter,
  createAuthenticatedSettlementTransportReservationJournalAdapter,
} from './authenticated-settlement-reserved-execution.js';

type Candidate = Readonly<{ id: string }>;
type Prepared = Readonly<{ unsigned: string }>;
type SignedArtifact = Readonly<{ handle: string }>;
type Ports = AuthenticatedSettlementReservedExecutionPorts<
  Candidate,
  Prepared,
  SignedArtifact
>;

function expectFrozenOperation(adapter: object, operation: string): void {
  expect(Object.isFrozen(adapter)).toBe(true);
  expect(Object.keys(adapter)).toEqual([operation]);
}

function asOperation<T>(value: unknown): T {
  return value as T;
}

describe('authenticated settlement reserved-execution adapters', () => {
  it('exposes nine frozen single-operation capabilities with exact forwarding', async () => {
    const preSubmitRequest = Object.freeze({ marker: 'pre-submit-request' });
    const immediate = Object.freeze({ marker: 'immediate-revalidation' });
    const authorization = Object.freeze({ marker: 'broadcast-authorization' });
    const transportRequest = Object.freeze({ marker: 'transport-request' });
    const transportReservation = Object.freeze({
      marker: 'transport-reservation',
    });
    const submitRequest = Object.freeze({ marker: 'submit-request' });
    const submission = Object.freeze({ marker: 'submission' });
    const finalizationInput = Object.freeze({
      request: submitRequest,
      submission,
    });
    const finalization = Object.freeze({ marker: 'finalization' });
    const confirmation = Object.freeze({ marker: 'confirmation' });
    const confirmationJournal = Object.freeze({
      marker: 'confirmation-journal',
    });
    const durable = Object.freeze({ marker: 'durable-attempt' });
    const restartObservation = Object.freeze({
      marker: 'restart-observation',
    });
    const restartJournalInput = Object.freeze({
      durable,
      observation: restartObservation,
    });
    const restartJournal = Object.freeze({ marker: 'restart-journal' });

    const revalidate = vi.fn(async () => immediate);
    const authorize = vi.fn(() => authorization);
    const reserve = vi.fn(() => transportReservation);
    const submit = vi.fn(async () => submission);
    const finalize = vi.fn(() => finalization);
    const observeConfirmation = vi.fn(async () => confirmation);
    const recordConfirmation = vi.fn(() => confirmationJournal);
    const observeRestart = vi.fn(async () => restartObservation);
    const recordRestart = vi.fn(() => restartJournal);

    const adapters = [
      createAuthenticatedSettlementImmediateRevalidationAdapter<
        Candidate,
        Prepared,
        SignedArtifact
      >({
        revalidate: asOperation<
          Ports['immediateRevalidation']['revalidate']
        >(revalidate),
      }),
      createAuthenticatedSettlementBroadcastAuthorizationAdapter<
        Candidate,
        Prepared,
        SignedArtifact
      >({
        authorize: asOperation<
          Ports['broadcastAuthorization']['authorize']
        >(authorize),
      }),
      createAuthenticatedSettlementTransportReservationJournalAdapter<
        Candidate,
        Prepared,
        SignedArtifact
      >({
        reserve: asOperation<
          Ports['transportReservationJournal']['reserve']
        >(reserve),
      }),
      createAuthenticatedSettlementSubmitterAdapter<
        Candidate,
        Prepared,
        SignedArtifact
      >({
        submit: asOperation<Ports['submitter']['submit']>(submit),
      }),
      createAuthenticatedSettlementSubmissionJournalAdapter<
        Candidate,
        Prepared,
        SignedArtifact
      >({
        finalize: asOperation<
          Ports['submissionJournal']['finalize']
        >(finalize),
      }),
      createAuthenticatedSettlementConfirmationObservationAdapter<
        Candidate,
        Prepared,
        SignedArtifact
      >({
        observe: asOperation<
          Ports['confirmationObservation']['observe']
        >(observeConfirmation),
      }),
      createAuthenticatedSettlementConfirmationJournalAdapter<
        Candidate,
        Prepared,
        SignedArtifact
      >({
        record: asOperation<
          Ports['confirmationJournal']['record']
        >(recordConfirmation),
      }),
      createAuthenticatedSettlementRestartObservationAdapter({
        observe: asOperation<
          AuthenticatedSettlementRestartReconciliationPorts[
            'observation'
          ]['observe']
        >(observeRestart),
      }),
      createAuthenticatedSettlementRestartJournalAdapter({
        record: asOperation<
          AuthenticatedSettlementRestartReconciliationPorts[
            'journal'
          ]['record']
        >(recordRestart),
      }),
    ] as const;

    [
      'revalidate',
      'authorize',
      'reserve',
      'submit',
      'finalize',
      'observe',
      'record',
      'observe',
      'record',
    ].forEach((operation, index) =>
      expectFrozenOperation(adapters[index]!, operation)
    );

    await expect(
      adapters[0].revalidate(
        preSubmitRequest as unknown as Parameters<
          Ports['immediateRevalidation']['revalidate']
        >[0],
      ),
    ).resolves.toBe(immediate);
    expect(
      adapters[1].authorize(
        immediate as unknown as Parameters<
          Ports['broadcastAuthorization']['authorize']
        >[0],
      ),
    ).toBe(authorization);
    expect(
      adapters[2].reserve(
        transportRequest as unknown as Parameters<
          Ports['transportReservationJournal']['reserve']
        >[0],
      ),
    ).toBe(transportReservation);
    await expect(
      adapters[3].submit(
        submitRequest as unknown as Parameters<
          Ports['submitter']['submit']
        >[0],
      ),
    ).resolves.toBe(submission);
    expect(
      adapters[4].finalize(
        finalizationInput as unknown as Parameters<
          Ports['submissionJournal']['finalize']
        >[0],
      ),
    ).toBe(finalization);
    await expect(
      adapters[5].observe(
        finalization as unknown as Parameters<
          Ports['confirmationObservation']['observe']
        >[0],
      ),
    ).resolves.toBe(confirmation);
    expect(
      adapters[6].record(
        confirmation as unknown as Parameters<
          Ports['confirmationJournal']['record']
        >[0],
      ),
    ).toBe(confirmationJournal);
    await expect(
      adapters[7].observe(
        durable as unknown as Parameters<
          AuthenticatedSettlementRestartReconciliationPorts['observation']['observe']
        >[0],
      ),
    ).resolves.toBe(restartObservation);
    expect(
      adapters[8].record(
        restartJournalInput as unknown as Parameters<
          AuthenticatedSettlementRestartReconciliationPorts['journal']['record']
        >[0],
      ),
    ).toBe(restartJournal);
  });
});
