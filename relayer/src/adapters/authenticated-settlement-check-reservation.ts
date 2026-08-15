import type {
  AuthenticatedSettlementCheckReservationPorts,
} from '../relayer-core/authenticated-settlement-execution-lifecycle.js';

type Ports<Candidate, Prepared, SignedArtifact> =
  AuthenticatedSettlementCheckReservationPorts<
    Candidate,
    Prepared,
    SignedArtifact
  >;

export type AuthenticatedSettlementRevalidationAdapterDeps<
  Candidate,
  Prepared,
  SignedArtifact,
> = Readonly<{
  revalidate: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['revalidation']['revalidate'];
}>;

export type AuthenticatedSettlementPackageBindingAdapterDeps<
  Candidate,
  Prepared,
  SignedArtifact,
> = Readonly<{
  bind: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['packageBinding']['bind'];
}>;

export type AuthenticatedSettlementSignerAdapterDeps<
  Candidate,
  Prepared,
  SignedArtifact,
> = Readonly<{
  sign: Ports<Candidate, Prepared, SignedArtifact>['signer']['sign'];
}>;

export type AuthenticatedSettlementCheckerAdapterDeps<
  Candidate,
  Prepared,
  SignedArtifact,
> = Readonly<{
  check: Ports<Candidate, Prepared, SignedArtifact>['checker']['check'];
}>;

export type AuthenticatedSettlementStableErgoObservationAdapterDeps<
  Candidate,
  Prepared,
  SignedArtifact,
> = Readonly<{
  observe: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['stableErgoObservation']['observe'];
}>;

export type AuthenticatedSettlementStableSidechainObservationAdapterDeps<
  Candidate,
  Prepared,
  SignedArtifact,
> = Readonly<{
  observe: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['stableSidechainObservation']['observe'];
}>;

export type AuthenticatedSettlementCheckAdmissionAdapterDeps<
  Candidate,
  Prepared,
  SignedArtifact,
> = Readonly<{
  authorize: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['checkAdmission']['authorize'];
}>;

export type AuthenticatedSettlementCheckJournalAdapterDeps<
  Candidate,
  Prepared,
  SignedArtifact,
> = Readonly<{
  record: Ports<Candidate, Prepared, SignedArtifact>['checkJournal']['record'];
}>;

export type AuthenticatedSettlementExecutionAuthorizationAdapterDeps<
  Candidate,
  Prepared,
  SignedArtifact,
> = Readonly<{
  authorize: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['executionAuthorization']['authorize'];
}>;

export type AuthenticatedSettlementReservationAdmissionAdapterDeps<
  Candidate,
  Prepared,
  SignedArtifact,
> = Readonly<{
  authorize: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['reservationAdmission']['authorize'];
}>;

export type AuthenticatedSettlementExecutionReservationJournalAdapterDeps<
  Candidate,
  Prepared,
  SignedArtifact,
> = Readonly<{
  reserve: Ports<
    Candidate,
    Prepared,
    SignedArtifact
  >['executionReservationJournal']['reserve'];
}>;

export function createAuthenticatedSettlementRevalidationAdapter<
  Candidate,
  Prepared,
  SignedArtifact,
>(
  deps: AuthenticatedSettlementRevalidationAdapterDeps<
    Candidate,
    Prepared,
    SignedArtifact
  >,
): Ports<Candidate, Prepared, SignedArtifact>['revalidation'] {
  return Object.freeze({
    revalidate: (
      input: Parameters<typeof deps.revalidate>[0],
    ) => deps.revalidate(input),
  });
}

export function createAuthenticatedSettlementPackageBindingAdapter<
  Candidate,
  Prepared,
  SignedArtifact,
>(
  deps: AuthenticatedSettlementPackageBindingAdapterDeps<
    Candidate,
    Prepared,
    SignedArtifact
  >,
): Ports<Candidate, Prepared, SignedArtifact>['packageBinding'] {
  return Object.freeze({
    bind: (
      revalidation: Parameters<typeof deps.bind>[0],
    ) => deps.bind(revalidation),
  });
}

export function createAuthenticatedSettlementSignerAdapter<
  Candidate,
  Prepared,
  SignedArtifact,
>(
  deps: AuthenticatedSettlementSignerAdapterDeps<
    Candidate,
    Prepared,
    SignedArtifact
  >,
): Ports<Candidate, Prepared, SignedArtifact>['signer'] {
  return Object.freeze({
    sign: (
      binding: Parameters<typeof deps.sign>[0],
    ) => deps.sign(binding),
  });
}

export function createAuthenticatedSettlementCheckerAdapter<
  Candidate,
  Prepared,
  SignedArtifact,
>(
  deps: AuthenticatedSettlementCheckerAdapterDeps<
    Candidate,
    Prepared,
    SignedArtifact
  >,
): Ports<Candidate, Prepared, SignedArtifact>['checker'] {
  return Object.freeze({
    check: (
      signed: Parameters<typeof deps.check>[0],
    ) => deps.check(signed),
  });
}

export function createAuthenticatedSettlementStableErgoObservationAdapter<
  Candidate,
  Prepared,
  SignedArtifact,
>(
  deps: AuthenticatedSettlementStableErgoObservationAdapterDeps<
    Candidate,
    Prepared,
    SignedArtifact
  >,
): Ports<Candidate, Prepared, SignedArtifact>['stableErgoObservation'] {
  return Object.freeze({
    observe: (
      checked: Parameters<typeof deps.observe>[0],
    ) => deps.observe(checked),
  });
}

export function createAuthenticatedSettlementStableSidechainObservationAdapter<
  Candidate,
  Prepared,
  SignedArtifact,
>(
  deps: AuthenticatedSettlementStableSidechainObservationAdapterDeps<
    Candidate,
    Prepared,
    SignedArtifact
  >,
): Ports<Candidate, Prepared, SignedArtifact>['stableSidechainObservation'] {
  return Object.freeze({
    observe: (
      checked: Parameters<typeof deps.observe>[0],
    ) => deps.observe(checked),
  });
}

export function createAuthenticatedSettlementCheckAdmissionAdapter<
  Candidate,
  Prepared,
  SignedArtifact,
>(
  deps: AuthenticatedSettlementCheckAdmissionAdapterDeps<
    Candidate,
    Prepared,
    SignedArtifact
  >,
): Ports<Candidate, Prepared, SignedArtifact>['checkAdmission'] {
  return Object.freeze({
    authorize: (
      input: Parameters<typeof deps.authorize>[0],
    ) => deps.authorize(input),
  });
}

export function createAuthenticatedSettlementCheckJournalAdapter<
  Candidate,
  Prepared,
  SignedArtifact,
>(
  deps: AuthenticatedSettlementCheckJournalAdapterDeps<
    Candidate,
    Prepared,
    SignedArtifact
  >,
): Ports<Candidate, Prepared, SignedArtifact>['checkJournal'] {
  return Object.freeze({
    record: (
      admission: Parameters<typeof deps.record>[0],
    ) => deps.record(admission),
  });
}

export function createAuthenticatedSettlementExecutionAuthorizationAdapter<
  Candidate,
  Prepared,
  SignedArtifact,
>(
  deps: AuthenticatedSettlementExecutionAuthorizationAdapterDeps<
    Candidate,
    Prepared,
    SignedArtifact
  >,
): Ports<Candidate, Prepared, SignedArtifact>['executionAuthorization'] {
  return Object.freeze({
    authorize: (
      input: Parameters<typeof deps.authorize>[0],
    ) => deps.authorize(input),
  });
}

export function createAuthenticatedSettlementReservationAdmissionAdapter<
  Candidate,
  Prepared,
  SignedArtifact,
>(
  deps: AuthenticatedSettlementReservationAdmissionAdapterDeps<
    Candidate,
    Prepared,
    SignedArtifact
  >,
): Ports<Candidate, Prepared, SignedArtifact>['reservationAdmission'] {
  return Object.freeze({
    authorize: (
      authorization: Parameters<typeof deps.authorize>[0],
    ) => deps.authorize(authorization),
  });
}

export function createAuthenticatedSettlementExecutionReservationJournalAdapter<
  Candidate,
  Prepared,
  SignedArtifact,
>(
  deps: AuthenticatedSettlementExecutionReservationJournalAdapterDeps<
    Candidate,
    Prepared,
    SignedArtifact
  >,
): Ports<Candidate, Prepared, SignedArtifact>['executionReservationJournal'] {
  return Object.freeze({
    reserve: (
      admission: Parameters<typeof deps.reserve>[0],
    ) => deps.reserve(admission),
  });
}
