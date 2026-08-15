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
} from '../../adapters/authenticated-settlement-reserved-execution.js';
import {
  executeAuthenticatedSettlementReservedHandoff,
  reconcileAuthenticatedSettlementSubmission,
  type AuthenticatedSettlementDurableSubmissionIdentity,
  type AuthenticatedSettlementLifecycleHandoff,
  type AuthenticatedSettlementReservedExecutionPorts,
  type AuthenticatedSettlementReservedHandoff,
  type AuthenticatedSettlementRestartReconciliationPorts,
  type AuthenticatedSettlementRestartReconciliationResult,
} from '../../relayer-core/authenticated-settlement-execution-lifecycle.js';

type Ports<Candidate, Prepared, SignedArtifact> =
  AuthenticatedSettlementReservedExecutionPorts<
    Candidate,
    Prepared,
    SignedArtifact
  >;

type ForbiddenEarlierStageCapabilities = Readonly<{
  revalidation?: never;
  packageBinding?: never;
  signer?: never;
  checker?: never;
  stableErgoObservation?: never;
  stableSidechainObservation?: never;
  checkAdmission?: never;
  checkJournal?: never;
  executionAuthorization?: never;
  reservationAdmission?: never;
  executionReservationJournal?: never;
  fundsAuthority?: never;
}>;

export type AuthenticatedSettlementReservedExecutionApplicationDeps<
  Candidate,
  Prepared,
  SignedArtifact,
> = Readonly<{
  revalidateImmediately: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['immediateRevalidation']['revalidate'];
  authorizeBroadcast: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['broadcastAuthorization']['authorize'];
  reserveTransport: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['transportReservationJournal']['reserve'];
  submit: Ports<Candidate, Prepared, SignedArtifact>['submitter']['submit'];
  finalizeSubmission: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['submissionJournal']['finalize'];
  observeConfirmation: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['confirmationObservation']['observe'];
  recordConfirmation: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['confirmationJournal']['record'];
}> & ForbiddenEarlierStageCapabilities;

export type AuthenticatedSettlementRestartApplicationDeps = Readonly<{
  observe: AuthenticatedSettlementRestartReconciliationPorts['observation']['observe'];
  record: AuthenticatedSettlementRestartReconciliationPorts['journal']['record'];
  submitter?: never;
  broadcastAuthorization?: never;
  transportReservationJournal?: never;
  signer?: never;
  fundsAuthority?: never;
}>;

export async function runAuthenticatedSettlementReservedExecution<
  Candidate,
  Prepared,
  SignedArtifact,
>(
  handoff: AuthenticatedSettlementReservedHandoff<
    Candidate,
    Prepared,
    SignedArtifact
  >,
  deps: AuthenticatedSettlementReservedExecutionApplicationDeps<
    Candidate,
    Prepared,
    SignedArtifact
  >,
): Promise<
  AuthenticatedSettlementLifecycleHandoff<
    Candidate,
    Prepared,
    SignedArtifact
  >
> {
  const ports: Ports<Candidate, Prepared, SignedArtifact> = Object.freeze({
    immediateRevalidation:
      createAuthenticatedSettlementImmediateRevalidationAdapter({
        revalidate: deps.revalidateImmediately,
      }),
    broadcastAuthorization:
      createAuthenticatedSettlementBroadcastAuthorizationAdapter({
        authorize: deps.authorizeBroadcast,
      }),
    transportReservationJournal:
      createAuthenticatedSettlementTransportReservationJournalAdapter({
        reserve: deps.reserveTransport,
      }),
    submitter: createAuthenticatedSettlementSubmitterAdapter({
      submit: deps.submit,
    }),
    submissionJournal: createAuthenticatedSettlementSubmissionJournalAdapter({
      finalize: deps.finalizeSubmission,
    }),
    confirmationObservation:
      createAuthenticatedSettlementConfirmationObservationAdapter({
        observe: deps.observeConfirmation,
      }),
    confirmationJournal:
      createAuthenticatedSettlementConfirmationJournalAdapter({
        record: deps.recordConfirmation,
      }),
  });

  return executeAuthenticatedSettlementReservedHandoff(handoff, ports);
}

export async function reconcileAuthenticatedSettlementSubmissionAttempt(
  durable: AuthenticatedSettlementDurableSubmissionIdentity,
  deps: AuthenticatedSettlementRestartApplicationDeps,
): Promise<AuthenticatedSettlementRestartReconciliationResult> {
  const ports: AuthenticatedSettlementRestartReconciliationPorts =
    Object.freeze({
      observation: createAuthenticatedSettlementRestartObservationAdapter({
        observe: deps.observe,
      }),
      journal: createAuthenticatedSettlementRestartJournalAdapter({
        record: deps.record,
      }),
    });

  return reconcileAuthenticatedSettlementSubmission(durable, ports);
}
