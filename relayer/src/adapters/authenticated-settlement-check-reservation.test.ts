import { describe, expect, it, vi } from 'vitest';

import type {
  AuthenticatedSettlementCheckReservationPorts,
  AuthenticatedSettlementLifecycleInput,
} from '../relayer-core/authenticated-settlement-execution-lifecycle.js';
import {
  createAuthenticatedSettlementCheckAdmissionAdapter,
  createAuthenticatedSettlementCheckerAdapter,
  createAuthenticatedSettlementCheckJournalAdapter,
  createAuthenticatedSettlementExecutionAuthorizationAdapter,
  createAuthenticatedSettlementExecutionReservationJournalAdapter,
  createAuthenticatedSettlementPackageBindingAdapter,
  createAuthenticatedSettlementReservationAdmissionAdapter,
  createAuthenticatedSettlementRevalidationAdapter,
  createAuthenticatedSettlementSignerAdapter,
  createAuthenticatedSettlementStableErgoObservationAdapter,
  createAuthenticatedSettlementStableSidechainObservationAdapter,
} from './authenticated-settlement-check-reservation.js';

type Candidate = Readonly<{ id: string }>;
type Prepared = Readonly<{ unsigned: string }>;
type SignedArtifact = Readonly<{ signed: string }>;
type Ports = AuthenticatedSettlementCheckReservationPorts<
  Candidate,
  Prepared,
  SignedArtifact
>;

function expectFrozenOperation(adapter: object, operation: string): void {
  expect(Object.isFrozen(adapter)).toBe(true);
  expect(Object.keys(adapter)).toEqual([operation]);
}

describe('authenticated settlement check-reservation adapters', () => {
  it('exposes eleven frozen single-operation capabilities with exact forwarding', async () => {
    const input = Object.freeze({
      candidate: Object.freeze({ id: 'candidate-a' }),
    }) as AuthenticatedSettlementLifecycleInput<Candidate>;
    const revalidation = Object.freeze({
      marker: 'revalidation',
    }) as unknown as Awaited<ReturnType<Ports['revalidation']['revalidate']>>;
    const packageBinding = Object.freeze({
      marker: 'package-binding',
    }) as unknown as Awaited<ReturnType<Ports['packageBinding']['bind']>>;
    const signed = Object.freeze({
      marker: 'signed',
    }) as unknown as Awaited<ReturnType<Ports['signer']['sign']>>;
    const check = Object.freeze({
      marker: 'check',
    }) as unknown as Awaited<ReturnType<Ports['checker']['check']>>;
    const stableErgoView = Object.freeze({
      marker: 'stable-ergo',
    }) as unknown as Awaited<
      ReturnType<Ports['stableErgoObservation']['observe']>
    >;
    const stableSidechainView = Object.freeze({
      marker: 'stable-sidechain',
    }) as unknown as Awaited<
      ReturnType<Ports['stableSidechainObservation']['observe']>
    >;
    const checkAdmissionInput = Object.freeze({
      check,
      stableErgoView,
      stableSidechainView,
    });
    const checkAdmission = Object.freeze({
      marker: 'check-admission',
    }) as unknown as ReturnType<Ports['checkAdmission']['authorize']>;
    const checkJournal = Object.freeze({
      marker: 'check-journal',
    }) as unknown as ReturnType<Ports['checkJournal']['record']>;
    const executionAuthorizationInput = Object.freeze({
      checkAdmission,
      checkJournal,
    });
    const authorization = Object.freeze({
      marker: 'execution-authorization',
    }) as unknown as ReturnType<
      Ports['executionAuthorization']['authorize']
    >;
    const reservationAdmission = Object.freeze({
      marker: 'reservation-admission',
    }) as unknown as ReturnType<
      Ports['reservationAdmission']['authorize']
    >;
    const reservation = Object.freeze({
      marker: 'execution-reservation',
    }) as unknown as ReturnType<
      Ports['executionReservationJournal']['reserve']
    >;

    const revalidate = vi.fn(async () => revalidation);
    const bind = vi.fn(async () => packageBinding);
    const sign = vi.fn(async () => signed);
    const checkSigned = vi.fn(async () => check);
    const observeErgo = vi.fn(async () => stableErgoView);
    const observeSidechain = vi.fn(async () => stableSidechainView);
    const authorizeCheck = vi.fn(() => checkAdmission);
    const recordCheck = vi.fn(() => checkJournal);
    const authorizeExecution = vi.fn(() => authorization);
    const authorizeReservation = vi.fn(() => reservationAdmission);
    const reserveExecution = vi.fn(() => reservation);

    const adapters = [
      createAuthenticatedSettlementRevalidationAdapter<
        Candidate,
        Prepared,
        SignedArtifact
      >({ revalidate }),
      createAuthenticatedSettlementPackageBindingAdapter<
        Candidate,
        Prepared,
        SignedArtifact
      >({ bind }),
      createAuthenticatedSettlementSignerAdapter<
        Candidate,
        Prepared,
        SignedArtifact
      >({ sign }),
      createAuthenticatedSettlementCheckerAdapter<
        Candidate,
        Prepared,
        SignedArtifact
      >({ check: checkSigned }),
      createAuthenticatedSettlementStableErgoObservationAdapter<
        Candidate,
        Prepared,
        SignedArtifact
      >({ observe: observeErgo }),
      createAuthenticatedSettlementStableSidechainObservationAdapter<
        Candidate,
        Prepared,
        SignedArtifact
      >({ observe: observeSidechain }),
      createAuthenticatedSettlementCheckAdmissionAdapter<
        Candidate,
        Prepared,
        SignedArtifact
      >({ authorize: authorizeCheck }),
      createAuthenticatedSettlementCheckJournalAdapter<
        Candidate,
        Prepared,
        SignedArtifact
      >({ record: recordCheck }),
      createAuthenticatedSettlementExecutionAuthorizationAdapter<
        Candidate,
        Prepared,
        SignedArtifact
      >({ authorize: authorizeExecution }),
      createAuthenticatedSettlementReservationAdmissionAdapter<
        Candidate,
        Prepared,
        SignedArtifact
      >({ authorize: authorizeReservation }),
      createAuthenticatedSettlementExecutionReservationJournalAdapter<
        Candidate,
        Prepared,
        SignedArtifact
      >({ reserve: reserveExecution }),
    ] as const;

    const operationNames = [
      'revalidate',
      'bind',
      'sign',
      'check',
      'observe',
      'observe',
      'authorize',
      'record',
      'authorize',
      'authorize',
      'reserve',
    ] as const;
    adapters.forEach((adapter, index) => {
      expectFrozenOperation(adapter, operationNames[index]!);
    });

    await expect(adapters[0].revalidate(input)).resolves.toBe(revalidation);
    await expect(adapters[1].bind(revalidation)).resolves.toBe(packageBinding);
    await expect(adapters[2].sign(packageBinding)).resolves.toBe(signed);
    await expect(adapters[3].check(signed)).resolves.toBe(check);
    await expect(adapters[4].observe(check)).resolves.toBe(stableErgoView);
    await expect(adapters[5].observe(check)).resolves.toBe(stableSidechainView);
    expect(adapters[6].authorize(checkAdmissionInput)).toBe(checkAdmission);
    expect(adapters[7].record(checkAdmission)).toBe(checkJournal);
    expect(adapters[8].authorize(executionAuthorizationInput))
      .toBe(authorization);
    expect(adapters[9].authorize(authorization)).toBe(reservationAdmission);
    expect(adapters[10].reserve(reservationAdmission)).toBe(reservation);

    expect(revalidate).toHaveBeenCalledWith(input);
    expect(bind).toHaveBeenCalledWith(revalidation);
    expect(sign).toHaveBeenCalledWith(packageBinding);
    expect(checkSigned).toHaveBeenCalledWith(signed);
    expect(observeErgo).toHaveBeenCalledWith(check);
    expect(observeSidechain).toHaveBeenCalledWith(check);
    expect(authorizeCheck).toHaveBeenCalledWith(checkAdmissionInput);
    expect(recordCheck).toHaveBeenCalledWith(checkAdmission);
    expect(authorizeExecution).toHaveBeenCalledWith(
      executionAuthorizationInput,
    );
    expect(authorizeReservation).toHaveBeenCalledWith(authorization);
    expect(reserveExecution).toHaveBeenCalledWith(reservationAdmission);
  });
});
