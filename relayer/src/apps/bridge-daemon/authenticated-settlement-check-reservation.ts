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
} from '../../adapters/authenticated-settlement-check-reservation.js';
import {
  prepareAuthenticatedSettlementExecutionReservation,
  type AuthenticatedSettlementCheckReservationPorts,
  type AuthenticatedSettlementLifecycleInput,
  type AuthenticatedSettlementReservedHandoff,
} from '../../relayer-core/authenticated-settlement-execution-lifecycle.js';

type Ports<Candidate, Prepared, SignedArtifact> =
  AuthenticatedSettlementCheckReservationPorts<
    Candidate,
    Prepared,
    SignedArtifact
  >;

type ForbiddenLaterStageCapabilities = Readonly<{
  immediateRevalidation?: never;
  broadcastAuthorization?: never;
  transportReservationJournal?: never;
  submitter?: never;
  submissionJournal?: never;
  confirmationObservation?: never;
  confirmationJournal?: never;
  broadcast?: never;
  fundsAuthority?: never;
}>;

export type AuthenticatedSettlementCheckReservationApplicationDeps<
  Candidate,
  Prepared,
  SignedArtifact,
> = Readonly<{
  revalidate: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['revalidation']['revalidate'];
  bindPackage: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['packageBinding']['bind'];
  sign: Ports<Candidate, Prepared, SignedArtifact>['signer']['sign'];
  check: Ports<Candidate, Prepared, SignedArtifact>['checker']['check'];
  observeStableErgo: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['stableErgoObservation']['observe'];
  observeStableSidechain: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['stableSidechainObservation']['observe'];
  authorizeCheck: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['checkAdmission']['authorize'];
  recordCheck: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['checkJournal']['record'];
  authorizeExecution: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['executionAuthorization']['authorize'];
  authorizeReservation: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['reservationAdmission']['authorize'];
  reserveExecution: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['executionReservationJournal']['reserve'];
}> & ForbiddenLaterStageCapabilities;

export async function runAuthenticatedSettlementCheckReservation<
  Candidate,
  Prepared,
  SignedArtifact,
>(
  input: AuthenticatedSettlementLifecycleInput<Candidate>,
  deps: AuthenticatedSettlementCheckReservationApplicationDeps<
    Candidate,
    Prepared,
    SignedArtifact
  >,
): Promise<
  AuthenticatedSettlementReservedHandoff<
    Candidate,
    Prepared,
    SignedArtifact
  >
> {
  const ports: Ports<Candidate, Prepared, SignedArtifact> = Object.freeze({
    revalidation: createAuthenticatedSettlementRevalidationAdapter({
      revalidate: deps.revalidate,
    }),
    packageBinding: createAuthenticatedSettlementPackageBindingAdapter({
      bind: deps.bindPackage,
    }),
    signer: createAuthenticatedSettlementSignerAdapter({
      sign: deps.sign,
    }),
    checker: createAuthenticatedSettlementCheckerAdapter({
      check: deps.check,
    }),
    stableErgoObservation:
      createAuthenticatedSettlementStableErgoObservationAdapter({
        observe: deps.observeStableErgo,
      }),
    stableSidechainObservation:
      createAuthenticatedSettlementStableSidechainObservationAdapter({
        observe: deps.observeStableSidechain,
      }),
    checkAdmission: createAuthenticatedSettlementCheckAdmissionAdapter({
      authorize: deps.authorizeCheck,
    }),
    checkJournal: createAuthenticatedSettlementCheckJournalAdapter({
      record: deps.recordCheck,
    }),
    executionAuthorization:
      createAuthenticatedSettlementExecutionAuthorizationAdapter({
        authorize: deps.authorizeExecution,
      }),
    reservationAdmission:
      createAuthenticatedSettlementReservationAdmissionAdapter({
        authorize: deps.authorizeReservation,
      }),
    executionReservationJournal:
      createAuthenticatedSettlementExecutionReservationJournalAdapter({
        reserve: deps.reserveExecution,
      }),
  });

  return prepareAuthenticatedSettlementExecutionReservation(input, ports);
}
