export const AUTHENTICATED_SETTLEMENT_LIFECYCLE_SCHEMA =
  'e2s.authenticated-settlement-lifecycle.v1';

const AUTHENTICATED_SETTLEMENT_LIFECYCLE_HANDOFFS = new WeakSet<object>();
const AUTHENTICATED_SETTLEMENT_RESERVED_HANDOFFS = new WeakSet<object>();
const AUTHENTICATED_SETTLEMENT_TRANSPORT_RESERVATION_REQUESTS =
  new WeakSet<object>();

export type AuthenticatedSettlementLifecycleStatus =
  | 'submitted'
  | 'pending_reconciliation'
  | 'confirmed'
  | 'fail_closed';

export interface AuthenticatedSettlementLifecycleBinding<Candidate> {
  readonly candidate: Candidate;
  readonly candidateId: string;
  readonly expectedTxId: string;
  readonly unsignedTxDigestHex: string;
  readonly unsignedPackageDigestHex: string;
  readonly payoutDigestHex: string;
  readonly trackerBoxId: string;
  readonly duplicatePreventionBoxId: string;
}

export interface AuthenticatedSettlementLifecycleInput<Candidate> {
  readonly candidate: Candidate;
  readonly candidateId: string;
  readonly unsignedTxDigestHex: string;
  readonly unsignedPackageDigestHex: string;
  readonly payoutDigestHex: string;
  readonly trackerBoxId: string;
  readonly duplicatePreventionBoxId: string;
}

export interface AuthenticatedSettlementRevalidation<Candidate, Prepared>
  extends AuthenticatedSettlementLifecycleBinding<Candidate> {
  readonly input: AuthenticatedSettlementLifecycleInput<Candidate>;
  readonly prepared: Prepared;
  readonly revalidationDigestHex: string;
}

export interface AuthenticatedSettlementPackageBinding<Candidate, Prepared>
  extends AuthenticatedSettlementLifecycleBinding<Candidate> {
  readonly revalidation: AuthenticatedSettlementRevalidation<Candidate, Prepared>;
  readonly prepared: Prepared;
  readonly revalidationDigestHex: string;
  readonly packageBindingDigestHex: string;
}

export interface AuthenticatedSettlementSignedArtifact<
  Candidate,
  Prepared,
  SignedArtifact,
> extends AuthenticatedSettlementLifecycleBinding<Candidate> {
  readonly packageBinding: AuthenticatedSettlementPackageBinding<
    Candidate,
    Prepared
  >;
  readonly revalidationDigestHex: string;
  readonly packageBindingDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly signerContextDigestHex: string;
  readonly signedArtifact: SignedArtifact;
}

export interface AuthenticatedSettlementCheckedArtifact<
  Candidate,
  Prepared,
  SignedArtifact,
> extends AuthenticatedSettlementLifecycleBinding<Candidate> {
  readonly signed: AuthenticatedSettlementSignedArtifact<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly revalidationDigestHex: string;
  readonly packageBindingDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly signerContextDigestHex: string;
  readonly checkResponseDigestHex: string;
  readonly checkerIdentityDigestHex: string;
}

export interface AuthenticatedSettlementStableObservation<
  Candidate,
  Prepared,
  SignedArtifact,
> extends AuthenticatedSettlementLifecycleBinding<Candidate> {
  readonly check: AuthenticatedSettlementCheckedArtifact<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly revalidationDigestHex: string;
  readonly packageBindingDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly signerContextDigestHex: string;
  readonly checkResponseDigestHex: string;
  readonly checkerIdentityDigestHex: string;
  readonly viewDigestHex: string;
}

export interface AuthenticatedSettlementCheckAdmission<
  Candidate,
  Prepared,
  SignedArtifact,
> extends AuthenticatedSettlementLifecycleBinding<Candidate> {
  readonly check: AuthenticatedSettlementCheckedArtifact<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly stableErgoView: AuthenticatedSettlementStableObservation<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly stableSidechainView: AuthenticatedSettlementStableObservation<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly revalidationDigestHex: string;
  readonly packageBindingDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly signerContextDigestHex: string;
  readonly checkResponseDigestHex: string;
  readonly checkerIdentityDigestHex: string;
  readonly stableErgoViewDigestHex: string;
  readonly stableSidechainViewDigestHex: string;
  readonly admissionDigestHex: string;
}

export interface AuthenticatedSettlementCheckJournalResult<
  Candidate,
  Prepared,
  SignedArtifact,
> extends AuthenticatedSettlementLifecycleBinding<Candidate> {
  readonly admission: AuthenticatedSettlementCheckAdmission<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly revalidationDigestHex: string;
  readonly packageBindingDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly signerContextDigestHex: string;
  readonly checkResponseDigestHex: string;
  readonly checkerIdentityDigestHex: string;
  readonly stableErgoViewDigestHex: string;
  readonly stableSidechainViewDigestHex: string;
  readonly admissionDigestHex: string;
  readonly applied: boolean;
  readonly status: string;
}

export interface AuthenticatedSettlementExecutionAuthorization<
  Candidate,
  Prepared,
  SignedArtifact,
> extends AuthenticatedSettlementLifecycleBinding<Candidate> {
  readonly checkAdmission: AuthenticatedSettlementCheckAdmission<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly checkJournal: AuthenticatedSettlementCheckJournalResult<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly revalidationDigestHex: string;
  readonly packageBindingDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly signerContextDigestHex: string;
  readonly checkResponseDigestHex: string;
  readonly checkerIdentityDigestHex: string;
  readonly stableErgoViewDigestHex: string;
  readonly stableSidechainViewDigestHex: string;
  readonly admissionDigestHex: string;
  readonly authorizationDigestHex: string;
}

export interface AuthenticatedSettlementReservationAdmission<
  Candidate,
  Prepared,
  SignedArtifact,
> extends AuthenticatedSettlementLifecycleBinding<Candidate> {
  readonly authorization: AuthenticatedSettlementExecutionAuthorization<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly revalidationDigestHex: string;
  readonly packageBindingDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly signerContextDigestHex: string;
  readonly checkResponseDigestHex: string;
  readonly checkerIdentityDigestHex: string;
  readonly stableErgoViewDigestHex: string;
  readonly stableSidechainViewDigestHex: string;
  readonly admissionDigestHex: string;
  readonly authorizationDigestHex: string;
  readonly reservationDigestHex: string;
}

export interface AuthenticatedSettlementExecutionReservation<
  Candidate,
  Prepared,
  SignedArtifact,
> extends AuthenticatedSettlementLifecycleBinding<Candidate> {
  readonly admission: AuthenticatedSettlementReservationAdmission<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly revalidationDigestHex: string;
  readonly packageBindingDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly signerContextDigestHex: string;
  readonly checkResponseDigestHex: string;
  readonly checkerIdentityDigestHex: string;
  readonly stableErgoViewDigestHex: string;
  readonly stableSidechainViewDigestHex: string;
  readonly admissionDigestHex: string;
  readonly authorizationDigestHex: string;
  readonly reservationDigestHex: string;
  readonly applied: boolean;
  readonly status: string;
}

export interface AuthenticatedSettlementPreSubmitRequest<
  Candidate,
  Prepared,
  SignedArtifact,
> {
  readonly reservation: AuthenticatedSettlementExecutionReservation<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly signedArtifact: SignedArtifact;
}

export interface AuthenticatedSettlementImmediateRevalidation<
  Candidate,
  Prepared,
  SignedArtifact,
> extends AuthenticatedSettlementLifecycleBinding<Candidate> {
  readonly request: AuthenticatedSettlementPreSubmitRequest<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly signedArtifact: SignedArtifact;
  readonly revalidationDigestHex: string;
  readonly packageBindingDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly signerContextDigestHex: string;
  readonly checkResponseDigestHex: string;
  readonly checkerIdentityDigestHex: string;
  readonly stableErgoViewDigestHex: string;
  readonly stableSidechainViewDigestHex: string;
  readonly admissionDigestHex: string;
  readonly authorizationDigestHex: string;
  readonly reservationDigestHex: string;
  readonly preSubmitRevalidationDigestHex: string;
  readonly status: string;
}

export interface AuthenticatedSettlementBroadcastAuthorization<
  Candidate,
  Prepared,
  SignedArtifact,
> extends AuthenticatedSettlementLifecycleBinding<Candidate> {
  readonly revalidation: AuthenticatedSettlementImmediateRevalidation<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly signedArtifact: SignedArtifact;
  readonly revalidationDigestHex: string;
  readonly packageBindingDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly signerContextDigestHex: string;
  readonly checkResponseDigestHex: string;
  readonly checkerIdentityDigestHex: string;
  readonly stableErgoViewDigestHex: string;
  readonly stableSidechainViewDigestHex: string;
  readonly admissionDigestHex: string;
  readonly authorizationDigestHex: string;
  readonly reservationDigestHex: string;
  readonly preSubmitRevalidationDigestHex: string;
  readonly broadcastAuthorizationDigestHex: string;
}

export interface AuthenticatedSettlementTransportReservation<
  Candidate,
  Prepared,
  SignedArtifact,
> extends AuthenticatedSettlementLifecycleBinding<Candidate> {
  readonly authorization: AuthenticatedSettlementBroadcastAuthorization<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly signedArtifact: SignedArtifact;
  readonly revalidationDigestHex: string;
  readonly packageBindingDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly signerContextDigestHex: string;
  readonly checkResponseDigestHex: string;
  readonly checkerIdentityDigestHex: string;
  readonly stableErgoViewDigestHex: string;
  readonly stableSidechainViewDigestHex: string;
  readonly admissionDigestHex: string;
  readonly authorizationDigestHex: string;
  readonly reservationDigestHex: string;
  readonly preSubmitRevalidationDigestHex: string;
  readonly broadcastAuthorizationDigestHex: string;
  readonly transportReservationDigestHex: string;
  readonly durableAttemptDigestHex: string;
  readonly applied: boolean;
  readonly status: string;
}

export interface AuthenticatedSettlementTransportReservationRequest<
  Candidate,
  Prepared,
  SignedArtifact,
> {
  readonly authorization: AuthenticatedSettlementBroadcastAuthorization<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly signedArtifact: SignedArtifact;
}

export interface AuthenticatedSettlementSubmitRequest<
  Candidate,
  Prepared,
  SignedArtifact,
> {
  readonly authorization: AuthenticatedSettlementBroadcastAuthorization<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly transportReservation: AuthenticatedSettlementTransportReservation<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly signedArtifact: SignedArtifact;
  readonly signedTransactionDigestHex: string;
}

export interface AuthenticatedSettlementSubmitResult<
  Candidate,
  Prepared,
  SignedArtifact,
> extends AuthenticatedSettlementLifecycleBinding<Candidate> {
  readonly request: AuthenticatedSettlementSubmitRequest<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly signedArtifact: SignedArtifact;
  readonly revalidationDigestHex: string;
  readonly packageBindingDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly signerContextDigestHex: string;
  readonly checkResponseDigestHex: string;
  readonly checkerIdentityDigestHex: string;
  readonly stableErgoViewDigestHex: string;
  readonly stableSidechainViewDigestHex: string;
  readonly admissionDigestHex: string;
  readonly authorizationDigestHex: string;
  readonly reservationDigestHex: string;
  readonly preSubmitRevalidationDigestHex: string;
  readonly broadcastAuthorizationDigestHex: string;
  readonly transportReservationDigestHex: string;
  readonly durableAttemptDigestHex: string;
  readonly status: 'accepted' | 'rejected' | 'ambiguous';
  readonly submittedTxId: string | null;
}

export interface AuthenticatedSettlementSubmissionFinalization<
  Candidate,
  Prepared,
  SignedArtifact,
> extends AuthenticatedSettlementLifecycleBinding<Candidate> {
  readonly request: AuthenticatedSettlementSubmitRequest<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly submission: AuthenticatedSettlementSubmitResult<
    Candidate,
    Prepared,
    SignedArtifact
  > | null;
  readonly revalidationDigestHex: string;
  readonly packageBindingDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly signerContextDigestHex: string;
  readonly checkResponseDigestHex: string;
  readonly checkerIdentityDigestHex: string;
  readonly stableErgoViewDigestHex: string;
  readonly stableSidechainViewDigestHex: string;
  readonly admissionDigestHex: string;
  readonly authorizationDigestHex: string;
  readonly reservationDigestHex: string;
  readonly preSubmitRevalidationDigestHex: string;
  readonly broadcastAuthorizationDigestHex: string;
  readonly transportReservationDigestHex: string;
  readonly durableAttemptDigestHex: string;
  readonly applied: boolean;
  readonly status: string;
  readonly submittedTxId: string | null;
}

export type AuthenticatedSettlementConfirmationObservationStatus =
  | 'submitted_unconfirmed'
  | 'confirmed'
  | 'inconclusive'
  | 'stale'
  | 'reorged';

export interface AuthenticatedSettlementConfirmationObservation<
  Candidate,
  Prepared,
  SignedArtifact,
> extends AuthenticatedSettlementLifecycleBinding<Candidate> {
  readonly finalization: AuthenticatedSettlementSubmissionFinalization<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly revalidationDigestHex: string;
  readonly packageBindingDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly signerContextDigestHex: string;
  readonly checkResponseDigestHex: string;
  readonly checkerIdentityDigestHex: string;
  readonly stableErgoViewDigestHex: string;
  readonly stableSidechainViewDigestHex: string;
  readonly admissionDigestHex: string;
  readonly authorizationDigestHex: string;
  readonly reservationDigestHex: string;
  readonly preSubmitRevalidationDigestHex: string;
  readonly broadcastAuthorizationDigestHex: string;
  readonly transportReservationDigestHex: string;
  readonly durableAttemptDigestHex: string;
  readonly observationDigestHex: string;
  readonly status: AuthenticatedSettlementConfirmationObservationStatus;
}

export interface AuthenticatedSettlementConfirmationJournalResult<
  Candidate,
  Prepared,
  SignedArtifact,
> extends AuthenticatedSettlementLifecycleBinding<Candidate> {
  readonly observation: AuthenticatedSettlementConfirmationObservation<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly revalidationDigestHex: string;
  readonly packageBindingDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly signerContextDigestHex: string;
  readonly checkResponseDigestHex: string;
  readonly checkerIdentityDigestHex: string;
  readonly stableErgoViewDigestHex: string;
  readonly stableSidechainViewDigestHex: string;
  readonly admissionDigestHex: string;
  readonly authorizationDigestHex: string;
  readonly reservationDigestHex: string;
  readonly preSubmitRevalidationDigestHex: string;
  readonly broadcastAuthorizationDigestHex: string;
  readonly transportReservationDigestHex: string;
  readonly durableAttemptDigestHex: string;
  readonly observationDigestHex: string;
  readonly applied: boolean;
  readonly terminalStateRetained?: boolean;
  readonly status: string;
}

export interface AuthenticatedSettlementLifecyclePorts<
  Candidate,
  Prepared,
  SignedArtifact,
> {
  readonly revalidation: {
    revalidate(
      input: AuthenticatedSettlementLifecycleInput<Candidate>,
    ): Promise<AuthenticatedSettlementRevalidation<Candidate, Prepared>>;
  };
  readonly packageBinding: {
    bind(
      revalidation: AuthenticatedSettlementRevalidation<Candidate, Prepared>,
    ): Promise<AuthenticatedSettlementPackageBinding<Candidate, Prepared>>;
  };
  readonly signer: {
    sign(
      binding: AuthenticatedSettlementPackageBinding<Candidate, Prepared>,
    ): Promise<
      AuthenticatedSettlementSignedArtifact<
        Candidate,
        Prepared,
        SignedArtifact
      >
    >;
  };
  readonly checker: {
    check(
      signed: AuthenticatedSettlementSignedArtifact<
        Candidate,
        Prepared,
        SignedArtifact
      >,
    ): Promise<
      AuthenticatedSettlementCheckedArtifact<
        Candidate,
        Prepared,
        SignedArtifact
      >
    >;
  };
  readonly stableErgoObservation: {
    observe(
      checked: AuthenticatedSettlementCheckedArtifact<
        Candidate,
        Prepared,
        SignedArtifact
      >,
    ): Promise<
      AuthenticatedSettlementStableObservation<
        Candidate,
        Prepared,
        SignedArtifact
      >
    >;
  };
  readonly stableSidechainObservation: {
    observe(
      checked: AuthenticatedSettlementCheckedArtifact<
        Candidate,
        Prepared,
        SignedArtifact
      >,
    ): Promise<
      AuthenticatedSettlementStableObservation<
        Candidate,
        Prepared,
        SignedArtifact
      >
    >;
  };
  readonly checkAdmission: {
    authorize(input: {
      check: AuthenticatedSettlementCheckedArtifact<
        Candidate,
        Prepared,
        SignedArtifact
      >;
      stableErgoView: AuthenticatedSettlementStableObservation<
        Candidate,
        Prepared,
        SignedArtifact
      >;
      stableSidechainView: AuthenticatedSettlementStableObservation<
        Candidate,
        Prepared,
        SignedArtifact
      >;
    }): AuthenticatedSettlementCheckAdmission<
      Candidate,
      Prepared,
      SignedArtifact
    >;
  };
  readonly checkJournal: {
    record(
      admission: AuthenticatedSettlementCheckAdmission<
        Candidate,
        Prepared,
        SignedArtifact
      >,
    ): AuthenticatedSettlementCheckJournalResult<
      Candidate,
      Prepared,
      SignedArtifact
    >;
  };
  readonly executionAuthorization: {
    authorize(input: {
      checkAdmission: AuthenticatedSettlementCheckAdmission<
        Candidate,
        Prepared,
        SignedArtifact
      >;
      checkJournal: AuthenticatedSettlementCheckJournalResult<
        Candidate,
        Prepared,
        SignedArtifact
      >;
    }): AuthenticatedSettlementExecutionAuthorization<
      Candidate,
      Prepared,
      SignedArtifact
    >;
  };
  readonly reservationAdmission: {
    authorize(
      authorization: AuthenticatedSettlementExecutionAuthorization<
        Candidate,
        Prepared,
        SignedArtifact
      >,
    ): AuthenticatedSettlementReservationAdmission<
      Candidate,
      Prepared,
      SignedArtifact
    >;
  };
  readonly executionReservationJournal: {
    reserve(
      admission: AuthenticatedSettlementReservationAdmission<
        Candidate,
        Prepared,
        SignedArtifact
      >,
    ): AuthenticatedSettlementExecutionReservation<
      Candidate,
      Prepared,
      SignedArtifact
    >;
  };
  readonly immediateRevalidation: {
    revalidate(
      request: AuthenticatedSettlementPreSubmitRequest<
        Candidate,
        Prepared,
        SignedArtifact
      >,
    ): Promise<
      AuthenticatedSettlementImmediateRevalidation<
        Candidate,
        Prepared,
        SignedArtifact
      >
    >;
  };
  readonly broadcastAuthorization: {
    authorize(
      revalidation: AuthenticatedSettlementImmediateRevalidation<
        Candidate,
        Prepared,
        SignedArtifact
      >,
    ): AuthenticatedSettlementBroadcastAuthorization<
      Candidate,
      Prepared,
      SignedArtifact
    >;
  };
  readonly transportReservationJournal: {
    reserve(
      request: AuthenticatedSettlementTransportReservationRequest<
        Candidate,
        Prepared,
        SignedArtifact
      >,
    ): AuthenticatedSettlementTransportReservation<
      Candidate,
      Prepared,
      SignedArtifact
    >;
  };
  readonly submitter: {
    submit(
      request: AuthenticatedSettlementSubmitRequest<
        Candidate,
        Prepared,
        SignedArtifact
      >,
    ): Promise<
      AuthenticatedSettlementSubmitResult<
        Candidate,
        Prepared,
        SignedArtifact
      > | null
    >;
  };
  readonly submissionJournal: {
    finalize(input: {
      request: AuthenticatedSettlementSubmitRequest<
        Candidate,
        Prepared,
        SignedArtifact
      >;
      submission: AuthenticatedSettlementSubmitResult<
        Candidate,
        Prepared,
        SignedArtifact
      > | null;
    }): AuthenticatedSettlementSubmissionFinalization<
      Candidate,
      Prepared,
      SignedArtifact
    >;
  };
  readonly confirmationObservation: {
    observe(
      finalization: AuthenticatedSettlementSubmissionFinalization<
        Candidate,
        Prepared,
        SignedArtifact
      >,
    ): Promise<
      AuthenticatedSettlementConfirmationObservation<
        Candidate,
        Prepared,
        SignedArtifact
      >
    >;
  };
  readonly confirmationJournal: {
    record(
      observation: AuthenticatedSettlementConfirmationObservation<
        Candidate,
        Prepared,
        SignedArtifact
      >,
    ): AuthenticatedSettlementConfirmationJournalResult<
      Candidate,
      Prepared,
      SignedArtifact
    >;
  };
}

export type AuthenticatedSettlementCheckReservationPorts<
  Candidate,
  Prepared,
  SignedArtifact,
> = Pick<
  AuthenticatedSettlementLifecyclePorts<Candidate, Prepared, SignedArtifact>,
  | 'revalidation'
  | 'packageBinding'
  | 'signer'
  | 'checker'
  | 'stableErgoObservation'
  | 'stableSidechainObservation'
  | 'checkAdmission'
  | 'checkJournal'
  | 'executionAuthorization'
  | 'reservationAdmission'
  | 'executionReservationJournal'
>;

export type AuthenticatedSettlementReservedExecutionPorts<
  Candidate,
  Prepared,
  SignedArtifact,
> = Pick<
  AuthenticatedSettlementLifecyclePorts<Candidate, Prepared, SignedArtifact>,
  | 'immediateRevalidation'
  | 'broadcastAuthorization'
  | 'transportReservationJournal'
  | 'submitter'
  | 'submissionJournal'
  | 'confirmationObservation'
  | 'confirmationJournal'
>;

export interface AuthenticatedSettlementReservedIdentity {
  readonly candidateId: string;
  readonly expectedTxId: string;
  readonly unsignedTxDigestHex: string;
  readonly unsignedPackageDigestHex: string;
  readonly payoutDigestHex: string;
  readonly trackerBoxId: string;
  readonly duplicatePreventionBoxId: string;
  readonly revalidationDigestHex: string;
  readonly packageBindingDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly signerContextDigestHex: string;
  readonly checkResponseDigestHex: string;
  readonly checkerIdentityDigestHex: string;
  readonly stableErgoViewDigestHex: string;
  readonly stableSidechainViewDigestHex: string;
  readonly admissionDigestHex: string;
  readonly authorizationDigestHex: string;
  readonly reservationDigestHex: string;
}

export interface AuthenticatedSettlementReservedHandoff<
  Candidate,
  Prepared,
  SignedArtifact,
> {
  readonly schema: typeof AUTHENTICATED_SETTLEMENT_LIFECYCLE_SCHEMA;
  readonly input: AuthenticatedSettlementLifecycleInput<Candidate>;
  readonly identity: Readonly<AuthenticatedSettlementReservedIdentity>;
  readonly candidate: Candidate;
  readonly revalidation: AuthenticatedSettlementRevalidation<Candidate, Prepared>;
  readonly packageBinding: AuthenticatedSettlementPackageBinding<
    Candidate,
    Prepared
  >;
  readonly signed: AuthenticatedSettlementSignedArtifact<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly signedArtifact: SignedArtifact;
  readonly check: AuthenticatedSettlementCheckedArtifact<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly stableErgoView: AuthenticatedSettlementStableObservation<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly stableSidechainView: AuthenticatedSettlementStableObservation<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly checkAdmission: AuthenticatedSettlementCheckAdmission<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly checkJournal: AuthenticatedSettlementCheckJournalResult<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly authorization: AuthenticatedSettlementExecutionAuthorization<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly reservationAdmission: AuthenticatedSettlementReservationAdmission<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly reservation: AuthenticatedSettlementExecutionReservation<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly boundary: Readonly<{
    laterExecutionRequired: true;
    submissionCapabilityPresent: false;
    fundsAuthorityGranted: false;
  }>;
}

export interface AuthenticatedSettlementLifecycleHandoff<
  Candidate,
  Prepared,
  SignedArtifact,
> {
  readonly schema: typeof AUTHENTICATED_SETTLEMENT_LIFECYCLE_SCHEMA;
  readonly status: AuthenticatedSettlementLifecycleStatus;
  readonly candidate: Candidate;
  readonly signedArtifact: SignedArtifact;
  readonly signed: AuthenticatedSettlementSignedArtifact<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly check: AuthenticatedSettlementCheckedArtifact<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly authorization: AuthenticatedSettlementExecutionAuthorization<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly reservation: AuthenticatedSettlementExecutionReservation<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly immediateRevalidation: AuthenticatedSettlementImmediateRevalidation<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly broadcastAuthorization: AuthenticatedSettlementBroadcastAuthorization<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly transportReservation: AuthenticatedSettlementTransportReservation<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly submission: AuthenticatedSettlementSubmitResult<
    Candidate,
    Prepared,
    SignedArtifact
  > | null;
  readonly finalization: AuthenticatedSettlementSubmissionFinalization<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly confirmation: AuthenticatedSettlementConfirmationObservation<
    Candidate,
    Prepared,
    SignedArtifact
  > | null;
  readonly confirmationJournal: AuthenticatedSettlementConfirmationJournalResult<
    Candidate,
    Prepared,
    SignedArtifact
  > | null;
  readonly boundary: Readonly<{
    portsAloneGrantFundsAuthority: false;
    freshRestartCannotRecreateEphemeralAuthority: true;
  }>;
}

type DigestKey =
  | 'unsignedTxDigestHex'
  | 'unsignedPackageDigestHex'
  | 'payoutDigestHex'
  | 'revalidationDigestHex'
  | 'packageBindingDigestHex'
  | 'signedTransactionDigestHex'
  | 'signerContextDigestHex'
  | 'checkResponseDigestHex'
  | 'checkerIdentityDigestHex'
  | 'stableErgoViewDigestHex'
  | 'stableSidechainViewDigestHex'
  | 'admissionDigestHex'
  | 'authorizationDigestHex'
  | 'reservationDigestHex'
  | 'preSubmitRevalidationDigestHex'
  | 'broadcastAuthorizationDigestHex'
  | 'transportReservationDigestHex'
  | 'durableAttemptDigestHex'
  | 'observationDigestHex';

type ExpectedBinding<Candidate> = {
  candidate: Candidate;
  candidateId: string;
  expectedTxId?: string;
  trackerBoxId: string;
  duplicatePreventionBoxId: string;
} & Partial<Record<DigestKey, string>>;

const CHECK_DIGESTS: readonly DigestKey[] = [
  'unsignedTxDigestHex',
  'unsignedPackageDigestHex',
  'payoutDigestHex',
  'revalidationDigestHex',
  'packageBindingDigestHex',
  'signedTransactionDigestHex',
  'signerContextDigestHex',
  'checkResponseDigestHex',
  'checkerIdentityDigestHex',
];

const ADMISSION_DIGESTS: readonly DigestKey[] = [
  ...CHECK_DIGESTS,
  'stableErgoViewDigestHex',
  'stableSidechainViewDigestHex',
  'admissionDigestHex',
];

const RESERVATION_DIGESTS: readonly DigestKey[] = [
  ...ADMISSION_DIGESTS,
  'authorizationDigestHex',
  'reservationDigestHex',
];

const PRE_SUBMIT_DIGESTS: readonly DigestKey[] = [
  ...RESERVATION_DIGESTS,
  'preSubmitRevalidationDigestHex',
];

const BROADCAST_DIGESTS: readonly DigestKey[] = [
  ...PRE_SUBMIT_DIGESTS,
  'broadcastAuthorizationDigestHex',
];

const TRANSPORT_DIGESTS: readonly DigestKey[] = [
  ...BROADCAST_DIGESTS,
  'transportReservationDigestHex',
  'durableAttemptDigestHex',
];

export async function prepareAuthenticatedSettlementExecutionReservation<
  Candidate,
  Prepared,
  SignedArtifact,
>(
  input: AuthenticatedSettlementLifecycleInput<Candidate>,
  ports: AuthenticatedSettlementCheckReservationPorts<
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
  const expected = expectedFromInput(input);

  const revalidation = await ports.revalidation.revalidate(input);
  exactParent(revalidation.input, input, 'revalidation input');
  expected.expectedTxId = canonicalHex(
    revalidation.expectedTxId,
    'revalidated expected transaction ID',
  );
  assertBinding(revalidation, 'revalidation', expected, [
    'unsignedTxDigestHex',
    'unsignedPackageDigestHex',
    'payoutDigestHex',
  ]);
  expected.revalidationDigestHex = canonicalHex(
    revalidation.revalidationDigestHex,
    'revalidation digest',
  );

  const packageBinding = await ports.packageBinding.bind(revalidation);
  exactParent(
    packageBinding.revalidation,
    revalidation,
    'package binding revalidation',
  );
  exactParent(
    packageBinding.prepared,
    revalidation.prepared,
    'package binding prepared artifact',
  );
  assertBinding(packageBinding, 'package binding', expected, [
    'unsignedTxDigestHex',
    'unsignedPackageDigestHex',
    'payoutDigestHex',
    'revalidationDigestHex',
  ]);
  expected.packageBindingDigestHex = canonicalHex(
    packageBinding.packageBindingDigestHex,
    'package binding digest',
  );

  const signed = await ports.signer.sign(packageBinding);
  exactParent(signed.packageBinding, packageBinding, 'signed package binding');
  assertBinding(signed, 'signed artifact', expected, [
    'unsignedTxDigestHex',
    'unsignedPackageDigestHex',
    'payoutDigestHex',
    'revalidationDigestHex',
    'packageBindingDigestHex',
  ]);
  if (signed.signedArtifact === null || signed.signedArtifact === undefined) {
    throw new Error('signed artifact is unavailable');
  }
  expected.signedTransactionDigestHex = canonicalHex(
    signed.signedTransactionDigestHex,
    'signed transaction digest',
  );
  expected.signerContextDigestHex = canonicalHex(
    signed.signerContextDigestHex,
    'signer context digest',
  );

  const check = await ports.checker.check(signed);
  exactParent(check.signed, signed, 'checked signed artifact');
  assertBinding(check, 'checked artifact', expected, [
    ...CHECK_DIGESTS.slice(0, 7),
  ]);
  expected.checkResponseDigestHex = canonicalHex(
    check.checkResponseDigestHex,
    'check response digest',
  );
  expected.checkerIdentityDigestHex = canonicalHex(
    check.checkerIdentityDigestHex,
    'checker identity digest',
  );

  const stableErgoView = await ports.stableErgoObservation.observe(check);
  exactParent(stableErgoView.check, check, 'stable Ergo observation check');
  assertBinding(stableErgoView, 'stable Ergo observation', expected, CHECK_DIGESTS);
  expected.stableErgoViewDigestHex = canonicalHex(
    stableErgoView.viewDigestHex,
    'stable Ergo view digest',
  );

  const stableSidechainView =
    await ports.stableSidechainObservation.observe(check);
  exactParent(
    stableSidechainView.check,
    check,
    'stable sidechain observation check',
  );
  assertBinding(
    stableSidechainView,
    'stable sidechain observation',
    expected,
    CHECK_DIGESTS,
  );
  expected.stableSidechainViewDigestHex = canonicalHex(
    stableSidechainView.viewDigestHex,
    'stable sidechain view digest',
  );

  const checkAdmission = ports.checkAdmission.authorize({
    check,
    stableErgoView,
    stableSidechainView,
  });
  exactParent(checkAdmission.check, check, 'check admission check');
  exactParent(
    checkAdmission.stableErgoView,
    stableErgoView,
    'check admission stable Ergo view',
  );
  exactParent(
    checkAdmission.stableSidechainView,
    stableSidechainView,
    'check admission stable sidechain view',
  );
  assertBinding(
    checkAdmission,
    'check admission',
    expected,
    ADMISSION_DIGESTS.slice(0, -1),
  );
  expected.admissionDigestHex = canonicalHex(
    checkAdmission.admissionDigestHex,
    'check admission digest',
  );

  const checkJournal = ports.checkJournal.record(checkAdmission);
  exactParent(checkJournal.admission, checkAdmission, 'check journal admission');
  assertBinding(checkJournal, 'check journal result', expected, ADMISSION_DIGESTS);
  requireAppliedStatus(
    checkJournal.applied,
    checkJournal.status,
    'check_passed',
    'check journal',
  );

  const authorization = ports.executionAuthorization.authorize({
    checkAdmission,
    checkJournal,
  });
  exactParent(
    authorization.checkAdmission,
    checkAdmission,
    'execution authorization check admission',
  );
  exactParent(
    authorization.checkJournal,
    checkJournal,
    'execution authorization check journal',
  );
  assertBinding(
    authorization,
    'execution authorization',
    expected,
    ADMISSION_DIGESTS,
  );
  expected.authorizationDigestHex = canonicalHex(
    authorization.authorizationDigestHex,
    'execution authorization digest',
  );

  const reservationAdmission =
    ports.reservationAdmission.authorize(authorization);
  exactParent(
    reservationAdmission.authorization,
    authorization,
    'reservation admission authorization',
  );
  assertBinding(
    reservationAdmission,
    'reservation admission',
    expected,
    RESERVATION_DIGESTS.slice(0, -1),
  );
  expected.reservationDigestHex = canonicalHex(
    reservationAdmission.reservationDigestHex,
    'execution reservation digest',
  );

  const reservation =
    ports.executionReservationJournal.reserve(reservationAdmission);
  exactParent(
    reservation.admission,
    reservationAdmission,
    'execution reservation admission',
  );
  assertBinding(
    reservation,
    'execution reservation',
    expected,
    RESERVATION_DIGESTS,
  );
  requireAppliedStatus(
    reservation.applied,
    reservation.status,
    'active',
    'execution reservation journal',
  );

  return brandReservedHandoff({
    input,
    expected,
    revalidation,
    packageBinding,
    signed,
    check,
    stableErgoView,
    stableSidechainView,
    checkAdmission,
    checkJournal,
    authorization,
    reservationAdmission,
    reservation,
  });
}

export async function executeAuthenticatedSettlementReservedHandoff<
  Candidate,
  Prepared,
  SignedArtifact,
>(
  handoff: AuthenticatedSettlementReservedHandoff<
    Candidate,
    Prepared,
    SignedArtifact
  >,
  ports: AuthenticatedSettlementReservedExecutionPorts<
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
  assertAuthenticatedSettlementReservedHandoffProvenance(handoff);
  const expected = expectedFromReservedHandoff(handoff);
  const {
    input,
    signed,
    check,
    authorization,
    reservation,
  } = handoff;
  const preSubmitRequest = Object.freeze({
    reservation,
    signedArtifact: signed.signedArtifact,
  });
  const immediateRevalidation =
    await ports.immediateRevalidation.revalidate(preSubmitRequest);
  exactParent(
    immediateRevalidation.request,
    preSubmitRequest,
    'immediate revalidation request',
  );
  exactParent(
    immediateRevalidation.signedArtifact,
    signed.signedArtifact,
    'immediate revalidation signed artifact',
  );
  assertBinding(
    immediateRevalidation,
    'immediate revalidation',
    expected,
    RESERVATION_DIGESTS,
  );
  if (immediateRevalidation.status !== 'valid') {
    throw new Error(
      `immediate revalidation returned unsupported status: ${String(immediateRevalidation.status)}`,
    );
  }
  expected.preSubmitRevalidationDigestHex = canonicalHex(
    immediateRevalidation.preSubmitRevalidationDigestHex,
    'immediate revalidation digest',
  );

  const broadcastAuthorization =
    ports.broadcastAuthorization.authorize(immediateRevalidation);
  exactParent(
    broadcastAuthorization.revalidation,
    immediateRevalidation,
    'broadcast authorization revalidation',
  );
  exactParent(
    broadcastAuthorization.signedArtifact,
    signed.signedArtifact,
    'broadcast authorization signed artifact',
  );
  assertBinding(
    broadcastAuthorization,
    'broadcast authorization',
    expected,
    PRE_SUBMIT_DIGESTS,
  );
  expected.broadcastAuthorizationDigestHex = canonicalHex(
    broadcastAuthorization.broadcastAuthorizationDigestHex,
    'broadcast authorization digest',
  );

  const transportReservationRequest = brandTransportReservationRequest({
    authorization: broadcastAuthorization,
    signedArtifact: signed.signedArtifact,
  });
  const transportReservation =
    ports.transportReservationJournal.reserve(transportReservationRequest);
  exactParent(
    transportReservation.authorization,
    broadcastAuthorization,
    'transport reservation authorization',
  );
  exactParent(
    transportReservation.signedArtifact,
    signed.signedArtifact,
    'transport reservation signed artifact',
  );
  assertBinding(
    transportReservation,
    'transport reservation',
    expected,
    BROADCAST_DIGESTS,
  );
  expected.transportReservationDigestHex = canonicalHex(
    transportReservation.transportReservationDigestHex,
    'transport reservation digest',
  );
  expected.durableAttemptDigestHex = canonicalHex(
    transportReservation.durableAttemptDigestHex,
    'durable submission attempt digest',
  );
  requireAppliedStatus(
    transportReservation.applied,
    transportReservation.status,
    'active',
    'transport reservation journal',
  );

  const submitRequest = Object.freeze({
    authorization: broadcastAuthorization,
    transportReservation,
    signedArtifact: signed.signedArtifact,
    signedTransactionDigestHex: expected.signedTransactionDigestHex!,
  });
  const submission = await ports.submitter.submit(submitRequest);
  if (submission !== null) {
    exactParent(submission.request, submitRequest, 'submission request');
    exactParent(
      submission.signedArtifact,
      signed.signedArtifact,
      'submitted signed artifact',
    );
    assertBinding(submission, 'submission result', expected, TRANSPORT_DIGESTS);
    if (submission.status === 'accepted') {
      exactCanonicalHex(
        submission.submittedTxId,
        requiredExpectedTxId(expected, 'submission result'),
        'submitted transaction ID',
      );
    } else if (
      (submission.status !== 'rejected' && submission.status !== 'ambiguous')
      || submission.submittedTxId !== null
    ) {
      throw new Error(
        `submitter returned unsupported result: ${String(submission.status)}`,
      );
    }
  }

  const finalization = ports.submissionJournal.finalize({
    request: submitRequest,
    submission,
  });
  exactParent(finalization.request, submitRequest, 'submission finalization request');
  exactParent(
    finalization.submission,
    submission,
    'submission finalization result',
  );
  assertBinding(
    finalization,
    'submission finalization',
    expected,
    TRANSPORT_DIGESTS,
  );
  if (finalization.applied !== true) {
    throw new Error('submission journal compare-and-set did not apply');
  }
  const submissionWasAccepted = submission?.status === 'accepted';
  const submissionWasRejected = submission?.status === 'rejected';
  const requiredFinalizationStatus = submissionWasAccepted
    ? 'submitted'
    : submissionWasRejected
      ? 'rejected'
      : 'pending';
  if (finalization.status !== requiredFinalizationStatus) {
    throw new Error(
      `submission journal returned unsupported status: ${String(finalization.status)}`,
    );
  }
  if (
    submissionWasAccepted
      ? exactCanonicalHex(
        finalization.submittedTxId,
        requiredExpectedTxId(expected, 'submission finalization'),
        'finalized submitted transaction ID',
      ) !== requiredExpectedTxId(expected, 'submission finalization')
      : finalization.submittedTxId !== null
  ) {
    throw new Error('submission finalization transaction identity is inconsistent');
  }

  if (!submissionWasAccepted) {
    return brandHandoff({
      status: submissionWasRejected ? 'fail_closed' : 'pending_reconciliation',
      input,
      signed,
      check,
      authorization,
      reservation,
      immediateRevalidation,
      broadcastAuthorization,
      transportReservation,
      submission,
      finalization,
      confirmation: null,
      confirmationJournal: null,
    });
  }

  const confirmation =
    await ports.confirmationObservation.observe(finalization);
  exactParent(
    confirmation.finalization,
    finalization,
    'confirmation observation finalization',
  );
  assertBinding(confirmation, 'confirmation observation', expected, [
    ...TRANSPORT_DIGESTS,
  ]);
  expected.observationDigestHex = canonicalHex(
    confirmation.observationDigestHex,
    'confirmation observation digest',
  );

  const confirmationJournal = ports.confirmationJournal.record(confirmation);
  exactParent(
    confirmationJournal.observation,
    confirmation,
    'confirmation journal observation',
  );
  assertBinding(confirmationJournal, 'confirmation journal result', expected, [
    ...TRANSPORT_DIGESTS,
    'observationDigestHex',
  ]);
  assertJournalApplicationOrTerminalRetention(
    confirmationJournal,
    'confirmation journal',
  );
  const status = confirmationOutcomeStatus(
    confirmation.status,
    confirmationJournal.status,
  );
  return brandHandoff({
    status,
    input,
    signed,
    check,
    authorization,
    reservation,
    immediateRevalidation,
    broadcastAuthorization,
    transportReservation,
    submission,
    finalization,
    confirmation,
    confirmationJournal,
  });
}

export async function executeAuthenticatedSettlementLifecycle<
  Candidate,
  Prepared,
  SignedArtifact,
>(
  input: AuthenticatedSettlementLifecycleInput<Candidate>,
  ports: AuthenticatedSettlementLifecyclePorts<
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
  const reserved = await prepareAuthenticatedSettlementExecutionReservation(
    input,
    ports,
  );
  return executeAuthenticatedSettlementReservedHandoff(reserved, ports);
}

export interface AuthenticatedSettlementDurableSubmissionIdentity
  extends Omit<AuthenticatedSettlementLifecycleBinding<null>, 'candidate'> {
  readonly status: 'pending' | 'submitted' | 'confirmed';
  readonly submissionAttempted: true;
  readonly signedTransactionDigestHex: string;
  readonly transportReservationDigestHex: string;
  readonly durableAttemptDigestHex: string;
}

export interface AuthenticatedSettlementRestartObservation
  extends Omit<AuthenticatedSettlementDurableSubmissionIdentity, 'status'> {
  readonly durable: AuthenticatedSettlementDurableSubmissionIdentity;
  readonly status: AuthenticatedSettlementConfirmationObservationStatus;
  readonly observationDigestHex: string;
}

export interface AuthenticatedSettlementRestartJournalResult {
  readonly observation: AuthenticatedSettlementRestartObservation;
  readonly candidateId: string;
  readonly expectedTxId: string;
  readonly unsignedTxDigestHex: string;
  readonly unsignedPackageDigestHex: string;
  readonly payoutDigestHex: string;
  readonly trackerBoxId: string;
  readonly duplicatePreventionBoxId: string;
  readonly signedTransactionDigestHex: string;
  readonly transportReservationDigestHex: string;
  readonly durableAttemptDigestHex: string;
  readonly observationDigestHex: string;
  readonly applied: boolean;
  readonly terminalStateRetained?: boolean;
  readonly status: string;
}

export interface AuthenticatedSettlementRestartReconciliationPorts {
  readonly observation: {
    observe(
      durable: AuthenticatedSettlementDurableSubmissionIdentity,
    ): Promise<AuthenticatedSettlementRestartObservation>;
  };
  readonly journal: {
    record(input: {
      durable: AuthenticatedSettlementDurableSubmissionIdentity;
      observation: AuthenticatedSettlementRestartObservation;
    }): AuthenticatedSettlementRestartJournalResult;
  };
}

export interface AuthenticatedSettlementRestartReconciliationResult {
  readonly status: AuthenticatedSettlementLifecycleStatus;
  readonly durable: AuthenticatedSettlementDurableSubmissionIdentity;
  readonly observation: AuthenticatedSettlementRestartObservation;
  readonly journal: AuthenticatedSettlementRestartJournalResult | null;
  readonly boundary: Readonly<{
    durableIdentityIsFundsAuthority: false;
    ephemeralAuthorityRestored: false;
  }>;
}

export async function reconcileAuthenticatedSettlementSubmission(
  durable: AuthenticatedSettlementDurableSubmissionIdentity,
  ports: AuthenticatedSettlementRestartReconciliationPorts,
): Promise<AuthenticatedSettlementRestartReconciliationResult> {
  assertDurableIdentity(durable);
  const observation = await ports.observation.observe(durable);
  exactParent(observation.durable, durable, 'restart observation durable identity');
  assertRestartBinding(observation, durable, 'restart observation');
  canonicalHex(observation.observationDigestHex, 'restart observation digest');

  const journal = ports.journal.record({ durable, observation });
  exactParent(journal.observation, observation, 'restart journal observation');
  assertRestartBinding(journal, durable, 'restart journal result');
  exactCanonicalHex(
    journal.observationDigestHex,
    observation.observationDigestHex,
    'restart journal observation digest',
  );
  assertJournalApplicationOrTerminalRetention(
    journal,
    'restart reconciliation journal',
  );
  const status = confirmationOutcomeStatus(
    observation.status,
    journal.status,
  );
  return freezeRestartResult({ status, durable, observation, journal });
}

export function assertAuthenticatedSettlementReservedHandoffProvenance(
  handoff: unknown,
): asserts handoff is AuthenticatedSettlementReservedHandoff<
  unknown,
  unknown,
  unknown
> {
  if (
    typeof handoff !== 'object'
    || handoff === null
    || !AUTHENTICATED_SETTLEMENT_RESERVED_HANDOFFS.has(handoff)
  ) {
    throw new Error(
      'authenticated settlement reserved handoff provenance is missing',
    );
  }
  const branded = handoff as AuthenticatedSettlementReservedHandoff<
    unknown,
    unknown,
    unknown
  >;
  if (
    branded.schema !== AUTHENTICATED_SETTLEMENT_LIFECYCLE_SCHEMA
    || branded.candidate !== branded.input.candidate
    || branded.revalidation.input !== branded.input
    || branded.packageBinding.revalidation !== branded.revalidation
    || branded.packageBinding.prepared !== branded.revalidation.prepared
    || branded.signed.packageBinding !== branded.packageBinding
    || branded.signedArtifact !== branded.signed.signedArtifact
    || branded.check.signed !== branded.signed
    || branded.stableErgoView.check !== branded.check
    || branded.stableSidechainView.check !== branded.check
    || branded.checkAdmission.check !== branded.check
    || branded.checkAdmission.stableErgoView !== branded.stableErgoView
    || branded.checkAdmission.stableSidechainView
      !== branded.stableSidechainView
    || branded.checkJournal.admission !== branded.checkAdmission
    || branded.authorization.checkAdmission !== branded.checkAdmission
    || branded.authorization.checkJournal !== branded.checkJournal
    || branded.reservationAdmission.authorization !== branded.authorization
    || branded.reservation.admission !== branded.reservationAdmission
    || !Object.isFrozen(branded)
    || !Object.isFrozen(branded.identity)
    || !Object.isFrozen(branded.boundary)
    || branded.boundary.laterExecutionRequired !== true
    || branded.boundary.submissionCapabilityPresent !== false
    || branded.boundary.fundsAuthorityGranted !== false
  ) {
    throw new Error(
      'authenticated settlement reserved handoff binding is inconsistent',
    );
  }
}

export function assertAuthenticatedSettlementTransportReservationRequestProvenance(
  request: unknown,
): asserts request is AuthenticatedSettlementTransportReservationRequest<
  unknown,
  unknown,
  unknown
> {
  if (
    typeof request !== 'object'
    || request === null
    || !AUTHENTICATED_SETTLEMENT_TRANSPORT_RESERVATION_REQUESTS.has(request)
  ) {
    throw new Error(
      'authenticated settlement transport reservation request provenance is missing',
    );
  }
  const branded =
    request as AuthenticatedSettlementTransportReservationRequest<
      unknown,
      unknown,
      unknown
    >;
  if (
    branded.signedArtifact !== branded.authorization.signedArtifact
    || branded.authorization.revalidation.signedArtifact
      !== branded.signedArtifact
    || !Object.isFrozen(branded)
  ) {
    throw new Error(
      'authenticated settlement transport reservation request binding is inconsistent',
    );
  }
}

export function assertAuthenticatedSettlementLifecycleHandoffProvenance(
  handoff: unknown,
): asserts handoff is AuthenticatedSettlementLifecycleHandoff<
  unknown,
  unknown,
  unknown
> {
  if (
    typeof handoff !== 'object'
    || handoff === null
    || !AUTHENTICATED_SETTLEMENT_LIFECYCLE_HANDOFFS.has(handoff)
  ) {
    throw new Error('authenticated settlement lifecycle provenance is missing');
  }
  const branded = handoff as AuthenticatedSettlementLifecycleHandoff<
    unknown,
    unknown,
    unknown
  >;
  if (
    branded.schema !== AUTHENTICATED_SETTLEMENT_LIFECYCLE_SCHEMA
    || branded.signedArtifact !== branded.signed.signedArtifact
    || !Object.isFrozen(branded)
    || !Object.isFrozen(branded.boundary)
    || branded.boundary.portsAloneGrantFundsAuthority !== false
    || branded.boundary.freshRestartCannotRecreateEphemeralAuthority !== true
  ) {
    throw new Error('authenticated settlement lifecycle binding is inconsistent');
  }
}

function expectedFromInput<Candidate>(
  input: AuthenticatedSettlementLifecycleInput<Candidate>,
): ExpectedBinding<Candidate> {
  const expected: ExpectedBinding<Candidate> = {
    candidate: input.candidate,
    candidateId: canonicalHex(input.candidateId, 'input candidate ID'),
    trackerBoxId: canonicalHex(input.trackerBoxId, 'input tracker box ID'),
    duplicatePreventionBoxId: canonicalHex(
      input.duplicatePreventionBoxId,
      'input duplicate-prevention box ID',
    ),
    unsignedTxDigestHex: canonicalHex(
      input.unsignedTxDigestHex,
      'input unsigned transaction digest',
    ),
    unsignedPackageDigestHex: canonicalHex(
      input.unsignedPackageDigestHex,
      'input unsigned package digest',
    ),
    payoutDigestHex: canonicalHex(input.payoutDigestHex, 'input payout digest'),
  };
  return expected;
}

function expectedFromReservedHandoff<Candidate, Prepared, SignedArtifact>(
  handoff: AuthenticatedSettlementReservedHandoff<
    Candidate,
    Prepared,
    SignedArtifact
  >,
): ExpectedBinding<Candidate> {
  const expected = expectedFromInput(handoff.input);
  const identity = handoff.identity;
  exactCanonicalHex(
    identity.candidateId,
    expected.candidateId,
    'reserved handoff candidate ID',
  );
  expected.expectedTxId = canonicalHex(
    identity.expectedTxId,
    'reserved handoff expected transaction ID',
  );
  exactCanonicalHex(
    identity.trackerBoxId,
    expected.trackerBoxId,
    'reserved handoff tracker box ID',
  );
  exactCanonicalHex(
    identity.duplicatePreventionBoxId,
    expected.duplicatePreventionBoxId,
    'reserved handoff duplicate-prevention box ID',
  );
  for (const key of RESERVATION_DIGESTS) {
    const value = canonicalHex(
      (identity as unknown as Record<string, unknown>)[key],
      `reserved handoff ${key}`,
    );
    const established = expected[key];
    if (established !== undefined && value !== established) {
      throw new Error(
        `reserved handoff ${key} does not match the input lifecycle binding`,
      );
    }
    expected[key] = value;
  }
  assertBinding(handoff.revalidation, 'reserved handoff revalidation', expected, [
    'unsignedTxDigestHex',
    'unsignedPackageDigestHex',
    'payoutDigestHex',
    'revalidationDigestHex',
  ]);
  assertBinding(handoff.packageBinding, 'reserved handoff package binding', expected, [
    'unsignedTxDigestHex',
    'unsignedPackageDigestHex',
    'payoutDigestHex',
    'revalidationDigestHex',
    'packageBindingDigestHex',
  ]);
  assertBinding(handoff.signed, 'reserved handoff signed artifact', expected, [
    'unsignedTxDigestHex',
    'unsignedPackageDigestHex',
    'payoutDigestHex',
    'revalidationDigestHex',
    'packageBindingDigestHex',
    'signedTransactionDigestHex',
    'signerContextDigestHex',
  ]);
  assertBinding(handoff.check, 'reserved handoff check', expected, CHECK_DIGESTS);
  assertBinding(
    handoff.stableErgoView,
    'reserved handoff stable Ergo view',
    expected,
    CHECK_DIGESTS,
  );
  exactCanonicalHex(
    handoff.stableErgoView.viewDigestHex,
    expected.stableErgoViewDigestHex!,
    'reserved handoff stable Ergo view digest',
  );
  assertBinding(
    handoff.stableSidechainView,
    'reserved handoff stable sidechain view',
    expected,
    CHECK_DIGESTS,
  );
  exactCanonicalHex(
    handoff.stableSidechainView.viewDigestHex,
    expected.stableSidechainViewDigestHex!,
    'reserved handoff stable sidechain view digest',
  );
  assertBinding(
    handoff.checkAdmission,
    'reserved handoff check admission',
    expected,
    ADMISSION_DIGESTS,
  );
  assertBinding(
    handoff.checkJournal,
    'reserved handoff check journal',
    expected,
    ADMISSION_DIGESTS,
  );
  requireAppliedStatus(
    handoff.checkJournal.applied,
    handoff.checkJournal.status,
    'check_passed',
    'reserved handoff check journal',
  );
  assertBinding(
    handoff.authorization,
    'reserved handoff execution authorization',
    expected,
    [...ADMISSION_DIGESTS, 'authorizationDigestHex'],
  );
  assertBinding(
    handoff.reservationAdmission,
    'reserved handoff reservation admission',
    expected,
    RESERVATION_DIGESTS,
  );
  assertBinding(
    handoff.reservation,
    'reserved handoff reservation',
    expected,
    RESERVATION_DIGESTS,
  );
  requireAppliedStatus(
    handoff.reservation.applied,
    handoff.reservation.status,
    'active',
    'reserved handoff execution reservation',
  );
  return expected;
}

function assertBinding<Candidate>(
  value: AuthenticatedSettlementLifecycleBinding<Candidate>,
  label: string,
  expected: ExpectedBinding<Candidate>,
  digestKeys: readonly DigestKey[],
): void {
  exactParent(value.candidate, expected.candidate, `${label} candidate`);
  exactCanonicalHex(value.candidateId, expected.candidateId, `${label} candidate ID`);
  exactCanonicalHex(
    value.expectedTxId,
    requiredExpectedTxId(expected, label),
    `${label} expected transaction ID`,
  );
  exactCanonicalHex(
    value.trackerBoxId,
    expected.trackerBoxId,
    `${label} tracker box ID`,
  );
  exactCanonicalHex(
    value.duplicatePreventionBoxId,
    expected.duplicatePreventionBoxId,
    `${label} duplicate-prevention box ID`,
  );
  const record = value as unknown as Record<string, unknown>;
  for (const key of digestKeys) {
    const expectedDigest = expected[key];
    if (expectedDigest === undefined) {
      throw new Error(`${label} ${key} has no established parent binding`);
    }
    exactCanonicalHex(record[key], expectedDigest, `${label} ${key}`);
  }
}

function requiredExpectedTxId<Candidate>(
  expected: ExpectedBinding<Candidate>,
  label: string,
): string {
  if (expected.expectedTxId === undefined) {
    throw new Error(`${label} has no established expected transaction ID`);
  }
  return expected.expectedTxId;
}

function assertDurableIdentity(
  durable: AuthenticatedSettlementDurableSubmissionIdentity,
): void {
  if (
    durable.submissionAttempted !== true
    || (
      durable.status !== 'pending'
      && durable.status !== 'submitted'
      && durable.status !== 'confirmed'
    )
  ) {
    throw new Error('restart reconciliation requires one durable attempted submission');
  }
  for (const [label, value] of Object.entries({
    'candidate ID': durable.candidateId,
    'expected transaction ID': durable.expectedTxId,
    'unsigned transaction digest': durable.unsignedTxDigestHex,
    'unsigned package digest': durable.unsignedPackageDigestHex,
    'payout digest': durable.payoutDigestHex,
    'tracker box ID': durable.trackerBoxId,
    'duplicate-prevention box ID': durable.duplicatePreventionBoxId,
    'signed transaction digest': durable.signedTransactionDigestHex,
    'transport reservation digest': durable.transportReservationDigestHex,
    'durable attempt digest': durable.durableAttemptDigestHex,
  })) {
    canonicalHex(value, `restart ${label}`);
  }
}

function assertRestartBinding(
  value: object,
  durable: AuthenticatedSettlementDurableSubmissionIdentity,
  label: string,
): void {
  for (const [field, expected] of Object.entries({
    candidateId: durable.candidateId,
    expectedTxId: durable.expectedTxId,
    unsignedTxDigestHex: durable.unsignedTxDigestHex,
    unsignedPackageDigestHex: durable.unsignedPackageDigestHex,
    payoutDigestHex: durable.payoutDigestHex,
    trackerBoxId: durable.trackerBoxId,
    duplicatePreventionBoxId: durable.duplicatePreventionBoxId,
    signedTransactionDigestHex: durable.signedTransactionDigestHex,
    transportReservationDigestHex: durable.transportReservationDigestHex,
    durableAttemptDigestHex: durable.durableAttemptDigestHex,
  })) {
    exactCanonicalHex(
      (value as unknown as Record<string, unknown>)[field],
      expected,
      `${label} ${field}`,
    );
  }
}

function confirmationOutcomeStatus(
  observationStatus: AuthenticatedSettlementConfirmationObservationStatus,
  journalStatus: string,
): AuthenticatedSettlementLifecycleStatus {
  if (journalStatus === 'quarantined') {
    return 'fail_closed';
  }
  if (observationStatus === 'confirmed' && journalStatus === 'confirmed') {
    return 'confirmed';
  }
  if (
    observationStatus === 'submitted_unconfirmed'
    && journalStatus === 'submitted'
  ) {
    return 'submitted';
  }
  if (
    observationStatus === 'inconclusive'
    && journalStatus === 'pending_reconciliation'
  ) {
    return 'pending_reconciliation';
  }
  throw new Error(
    `confirmation journal status ${String(journalStatus)} does not match observation ${observationStatus}`,
  );
}

function assertJournalApplicationOrTerminalRetention(
  journal: Readonly<{
    applied: boolean;
    terminalStateRetained?: boolean;
    status: string;
  }>,
  label: string,
): void {
  if (journal.applied === true && journal.terminalStateRetained !== true) {
    return;
  }
  if (
    journal.applied === false
    && journal.terminalStateRetained === true
    && journal.status === 'quarantined'
  ) {
    return;
  }
  throw new Error(`${label} compare-and-set did not apply`);
}

function brandReservedHandoff<Candidate, Prepared, SignedArtifact>(input: {
  input: AuthenticatedSettlementLifecycleInput<Candidate>;
  expected: ExpectedBinding<Candidate>;
  revalidation: AuthenticatedSettlementRevalidation<Candidate, Prepared>;
  packageBinding: AuthenticatedSettlementPackageBinding<Candidate, Prepared>;
  signed: AuthenticatedSettlementSignedArtifact<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  check: AuthenticatedSettlementCheckedArtifact<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  stableErgoView: AuthenticatedSettlementStableObservation<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  stableSidechainView: AuthenticatedSettlementStableObservation<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  checkAdmission: AuthenticatedSettlementCheckAdmission<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  checkJournal: AuthenticatedSettlementCheckJournalResult<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  authorization: AuthenticatedSettlementExecutionAuthorization<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  reservationAdmission: AuthenticatedSettlementReservationAdmission<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  reservation: AuthenticatedSettlementExecutionReservation<
    Candidate,
    Prepared,
    SignedArtifact
  >;
}): AuthenticatedSettlementReservedHandoff<
  Candidate,
  Prepared,
  SignedArtifact
> {
  const identity = deepFreezeOwned({
    candidateId: input.expected.candidateId,
    expectedTxId: requiredExpectedTxId(
      input.expected,
      'reserved handoff identity',
    ),
    unsignedTxDigestHex: input.expected.unsignedTxDigestHex!,
    unsignedPackageDigestHex: input.expected.unsignedPackageDigestHex!,
    payoutDigestHex: input.expected.payoutDigestHex!,
    trackerBoxId: input.expected.trackerBoxId,
    duplicatePreventionBoxId: input.expected.duplicatePreventionBoxId,
    revalidationDigestHex: input.expected.revalidationDigestHex!,
    packageBindingDigestHex: input.expected.packageBindingDigestHex!,
    signedTransactionDigestHex: input.expected.signedTransactionDigestHex!,
    signerContextDigestHex: input.expected.signerContextDigestHex!,
    checkResponseDigestHex: input.expected.checkResponseDigestHex!,
    checkerIdentityDigestHex: input.expected.checkerIdentityDigestHex!,
    stableErgoViewDigestHex: input.expected.stableErgoViewDigestHex!,
    stableSidechainViewDigestHex:
      input.expected.stableSidechainViewDigestHex!,
    admissionDigestHex: input.expected.admissionDigestHex!,
    authorizationDigestHex: input.expected.authorizationDigestHex!,
    reservationDigestHex: input.expected.reservationDigestHex!,
  });
  const handoff: AuthenticatedSettlementReservedHandoff<
    Candidate,
    Prepared,
    SignedArtifact
  > = {
    schema: AUTHENTICATED_SETTLEMENT_LIFECYCLE_SCHEMA,
    input: input.input,
    identity,
    candidate: input.input.candidate,
    revalidation: input.revalidation,
    packageBinding: input.packageBinding,
    signed: input.signed,
    signedArtifact: input.signed.signedArtifact,
    check: input.check,
    stableErgoView: input.stableErgoView,
    stableSidechainView: input.stableSidechainView,
    checkAdmission: input.checkAdmission,
    checkJournal: input.checkJournal,
    authorization: input.authorization,
    reservationAdmission: input.reservationAdmission,
    reservation: input.reservation,
    boundary: deepFreezeOwned({
      laterExecutionRequired: true as const,
      submissionCapabilityPresent: false as const,
      fundsAuthorityGranted: false as const,
    }),
  };
  Object.freeze(handoff);
  AUTHENTICATED_SETTLEMENT_RESERVED_HANDOFFS.add(handoff);
  return handoff;
}

function brandHandoff<Candidate, Prepared, SignedArtifact>(input: {
  status: AuthenticatedSettlementLifecycleStatus;
  input: AuthenticatedSettlementLifecycleInput<Candidate>;
  signed: AuthenticatedSettlementSignedArtifact<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  check: AuthenticatedSettlementCheckedArtifact<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  authorization: AuthenticatedSettlementExecutionAuthorization<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  reservation: AuthenticatedSettlementExecutionReservation<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  immediateRevalidation: AuthenticatedSettlementImmediateRevalidation<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  broadcastAuthorization: AuthenticatedSettlementBroadcastAuthorization<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  transportReservation: AuthenticatedSettlementTransportReservation<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  submission: AuthenticatedSettlementSubmitResult<
    Candidate,
    Prepared,
    SignedArtifact
  > | null;
  finalization: AuthenticatedSettlementSubmissionFinalization<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  confirmation: AuthenticatedSettlementConfirmationObservation<
    Candidate,
    Prepared,
    SignedArtifact
  > | null;
  confirmationJournal: AuthenticatedSettlementConfirmationJournalResult<
    Candidate,
    Prepared,
    SignedArtifact
  > | null;
}): AuthenticatedSettlementLifecycleHandoff<
  Candidate,
  Prepared,
  SignedArtifact
> {
  const handoff: AuthenticatedSettlementLifecycleHandoff<
    Candidate,
    Prepared,
    SignedArtifact
  > = {
    schema: AUTHENTICATED_SETTLEMENT_LIFECYCLE_SCHEMA,
    status: input.status,
    candidate: input.input.candidate,
    signedArtifact: input.signed.signedArtifact,
    signed: input.signed,
    check: input.check,
    authorization: input.authorization,
    reservation: input.reservation,
    immediateRevalidation: input.immediateRevalidation,
    broadcastAuthorization: input.broadcastAuthorization,
    transportReservation: input.transportReservation,
    submission: input.submission,
    finalization: input.finalization,
    confirmation: input.confirmation,
    confirmationJournal: input.confirmationJournal,
    boundary: deepFreezeOwned({
      portsAloneGrantFundsAuthority: false as const,
      freshRestartCannotRecreateEphemeralAuthority: true as const,
    }),
  };
  Object.freeze(handoff);
  AUTHENTICATED_SETTLEMENT_LIFECYCLE_HANDOFFS.add(handoff);
  return handoff;
}

function brandTransportReservationRequest<
  Candidate,
  Prepared,
  SignedArtifact,
>(input: {
  authorization: AuthenticatedSettlementBroadcastAuthorization<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  signedArtifact: SignedArtifact;
}): AuthenticatedSettlementTransportReservationRequest<
  Candidate,
  Prepared,
  SignedArtifact
> {
  const request = Object.freeze({
    authorization: input.authorization,
    signedArtifact: input.signedArtifact,
  });
  AUTHENTICATED_SETTLEMENT_TRANSPORT_RESERVATION_REQUESTS.add(request);
  return request;
}

function freezeRestartResult(input: {
  status: AuthenticatedSettlementLifecycleStatus;
  durable: AuthenticatedSettlementDurableSubmissionIdentity;
  observation: AuthenticatedSettlementRestartObservation;
  journal: AuthenticatedSettlementRestartJournalResult | null;
}): AuthenticatedSettlementRestartReconciliationResult {
  return Object.freeze({
    ...input,
    boundary: deepFreezeOwned({
      durableIdentityIsFundsAuthority: false as const,
      ephemeralAuthorityRestored: false as const,
    }),
  });
}

function requireAppliedStatus(
  applied: boolean,
  status: string,
  expected: string,
  label: string,
): void {
  if (applied !== true) {
    throw new Error(`${label} compare-and-set did not apply`);
  }
  if (status !== expected) {
    throw new Error(`${label} returned unsupported status: ${String(status)}`);
  }
}

function exactParent(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} must retain exact object identity`);
  }
}

function exactCanonicalHex(
  actual: unknown,
  expected: string,
  label: string,
): string {
  const canonical = canonicalHex(actual, label);
  if (canonical !== expected) {
    throw new Error(`${label} does not match the established lifecycle binding`);
  }
  return canonical;
}

function canonicalHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be canonical 32-byte lowercase hex`);
  }
  return value;
}

function deepFreezeOwned<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreezeOwned(child);
    }
  }
  return value;
}
