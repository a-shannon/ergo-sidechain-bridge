import type {
  AuthenticatedSettlementReservedExecutionPorts,
  AuthenticatedSettlementRestartReconciliationPorts,
} from '../relayer-core/authenticated-settlement-execution-lifecycle.js';

type Ports<Candidate, Prepared, SignedArtifact> =
  AuthenticatedSettlementReservedExecutionPorts<
    Candidate,
    Prepared,
    SignedArtifact
  >;

export function createAuthenticatedSettlementImmediateRevalidationAdapter<
  Candidate,
  Prepared,
  SignedArtifact,
>(deps: Readonly<{
  revalidate: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['immediateRevalidation']['revalidate'];
}>): Ports<Candidate, Prepared, SignedArtifact>['immediateRevalidation'] {
  return Object.freeze({
    revalidate: (
      request: Parameters<typeof deps.revalidate>[0],
    ) => deps.revalidate(request),
  });
}

export function createAuthenticatedSettlementBroadcastAuthorizationAdapter<
  Candidate,
  Prepared,
  SignedArtifact,
>(deps: Readonly<{
  authorize: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['broadcastAuthorization']['authorize'];
}>): Ports<Candidate, Prepared, SignedArtifact>['broadcastAuthorization'] {
  return Object.freeze({
    authorize: (
      revalidation: Parameters<typeof deps.authorize>[0],
    ) => deps.authorize(revalidation),
  });
}

export function createAuthenticatedSettlementTransportReservationJournalAdapter<
  Candidate,
  Prepared,
  SignedArtifact,
>(deps: Readonly<{
  reserve: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['transportReservationJournal']['reserve'];
}>): Ports<Candidate, Prepared, SignedArtifact>['transportReservationJournal'] {
  return Object.freeze({
    reserve: (
      request: Parameters<typeof deps.reserve>[0],
    ) => deps.reserve(request),
  });
}

export function createAuthenticatedSettlementSubmitterAdapter<
  Candidate,
  Prepared,
  SignedArtifact,
>(deps: Readonly<{
  submit: Ports<Candidate, Prepared, SignedArtifact>['submitter']['submit'];
}>): Ports<Candidate, Prepared, SignedArtifact>['submitter'] {
  return Object.freeze({
    submit: (
      request: Parameters<typeof deps.submit>[0],
    ) => deps.submit(request),
  });
}

export function createAuthenticatedSettlementSubmissionJournalAdapter<
  Candidate,
  Prepared,
  SignedArtifact,
>(deps: Readonly<{
  finalize: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['submissionJournal']['finalize'];
}>): Ports<Candidate, Prepared, SignedArtifact>['submissionJournal'] {
  return Object.freeze({
    finalize: (
      input: Parameters<typeof deps.finalize>[0],
    ) => deps.finalize(input),
  });
}

export function createAuthenticatedSettlementConfirmationObservationAdapter<
  Candidate,
  Prepared,
  SignedArtifact,
>(deps: Readonly<{
  observe: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['confirmationObservation']['observe'];
}>): Ports<Candidate, Prepared, SignedArtifact>['confirmationObservation'] {
  return Object.freeze({
    observe: (
      finalization: Parameters<typeof deps.observe>[0],
    ) => deps.observe(finalization),
  });
}

export function createAuthenticatedSettlementConfirmationJournalAdapter<
  Candidate,
  Prepared,
  SignedArtifact,
>(deps: Readonly<{
  record: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['confirmationJournal']['record'];
}>): Ports<Candidate, Prepared, SignedArtifact>['confirmationJournal'] {
  return Object.freeze({
    record: (
      observation: Parameters<typeof deps.record>[0],
    ) => deps.record(observation),
  });
}

export function createAuthenticatedSettlementRestartObservationAdapter(
  deps: Readonly<{
    observe:
      AuthenticatedSettlementRestartReconciliationPorts['observation']['observe'];
  }>,
): AuthenticatedSettlementRestartReconciliationPorts['observation'] {
  return Object.freeze({
    observe: (
      durable: Parameters<typeof deps.observe>[0],
    ) => deps.observe(durable),
  });
}

export function createAuthenticatedSettlementRestartJournalAdapter(
  deps: Readonly<{
    record: AuthenticatedSettlementRestartReconciliationPorts['journal']['record'];
  }>,
): AuthenticatedSettlementRestartReconciliationPorts['journal'] {
  return Object.freeze({
    record: (
      input: Parameters<typeof deps.record>[0],
    ) => deps.record(input),
  });
}
