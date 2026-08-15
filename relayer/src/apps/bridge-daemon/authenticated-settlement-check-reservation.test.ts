import { describe, expect, it, vi } from 'vitest';

import type {
  AuthenticatedSettlementCheckAdmission,
  AuthenticatedSettlementCheckedArtifact,
  AuthenticatedSettlementCheckJournalResult,
  AuthenticatedSettlementExecutionAuthorization,
  AuthenticatedSettlementExecutionReservation,
  AuthenticatedSettlementLifecycleBinding,
  AuthenticatedSettlementLifecycleInput,
  AuthenticatedSettlementPackageBinding,
  AuthenticatedSettlementReservationAdmission,
  AuthenticatedSettlementRevalidation,
  AuthenticatedSettlementSignedArtifact,
  AuthenticatedSettlementStableObservation,
} from '../../relayer-core/authenticated-settlement-execution-lifecycle.js';
import {
  runAuthenticatedSettlementCheckReservation,
  type AuthenticatedSettlementCheckReservationApplicationDeps,
} from './authenticated-settlement-check-reservation.js';

type Candidate = Readonly<{ id: string }>;
type Prepared = Readonly<{ unsigned: string }>;
type SignedArtifact = Readonly<{ signed: string }>;

const CANDIDATE = Object.freeze({ id: 'candidate-a' });
const PREPARED = Object.freeze({ unsigned: 'unsigned-transaction-a' });
const SIGNED_ARTIFACT = Object.freeze({ signed: 'signed-transaction-a' });

const DIGESTS = Object.freeze({
  unsignedTxDigestHex: '11'.repeat(32),
  unsignedPackageDigestHex: '12'.repeat(32),
  payoutDigestHex: '13'.repeat(32),
  revalidationDigestHex: '14'.repeat(32),
  packageBindingDigestHex: '15'.repeat(32),
  signedTransactionDigestHex: '16'.repeat(32),
  signerContextDigestHex: '17'.repeat(32),
  checkResponseDigestHex: '18'.repeat(32),
  checkerIdentityDigestHex: '19'.repeat(32),
  stableErgoViewDigestHex: '1a'.repeat(32),
  stableSidechainViewDigestHex: '1b'.repeat(32),
  admissionDigestHex: '1c'.repeat(32),
  authorizationDigestHex: '1d'.repeat(32),
  reservationDigestHex: '1e'.repeat(32),
});

const INPUT: AuthenticatedSettlementLifecycleInput<Candidate> = Object.freeze({
  candidate: CANDIDATE,
  candidateId: '21'.repeat(32),
  unsignedTxDigestHex: DIGESTS.unsignedTxDigestHex,
  unsignedPackageDigestHex: DIGESTS.unsignedPackageDigestHex,
  payoutDigestHex: DIGESTS.payoutDigestHex,
  trackerBoxId: '22'.repeat(32),
  duplicatePreventionBoxId: '23'.repeat(32),
});

const EXPECTED_TX_ID = '24'.repeat(32);

function binding(): AuthenticatedSettlementLifecycleBinding<Candidate> {
  return {
    ...INPUT,
    expectedTxId: EXPECTED_TX_ID,
  };
}

interface Fixture {
  readonly revalidation: AuthenticatedSettlementRevalidation<
    Candidate,
    Prepared
  >;
  readonly packageBinding: AuthenticatedSettlementPackageBinding<
    Candidate,
    Prepared
  >;
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
}

function fixture(): Fixture {
  const revalidation = Object.freeze({
    ...binding(),
    input: INPUT,
    prepared: PREPARED,
    revalidationDigestHex: DIGESTS.revalidationDigestHex,
  });
  const packageBinding = Object.freeze({
    ...binding(),
    revalidation,
    prepared: PREPARED,
    revalidationDigestHex: DIGESTS.revalidationDigestHex,
    packageBindingDigestHex: DIGESTS.packageBindingDigestHex,
  });
  const signed = Object.freeze({
    ...binding(),
    packageBinding,
    revalidationDigestHex: DIGESTS.revalidationDigestHex,
    packageBindingDigestHex: DIGESTS.packageBindingDigestHex,
    signedTransactionDigestHex: DIGESTS.signedTransactionDigestHex,
    signerContextDigestHex: DIGESTS.signerContextDigestHex,
    signedArtifact: SIGNED_ARTIFACT,
  });
  const check = Object.freeze({
    ...binding(),
    signed,
    revalidationDigestHex: DIGESTS.revalidationDigestHex,
    packageBindingDigestHex: DIGESTS.packageBindingDigestHex,
    signedTransactionDigestHex: DIGESTS.signedTransactionDigestHex,
    signerContextDigestHex: DIGESTS.signerContextDigestHex,
    checkResponseDigestHex: DIGESTS.checkResponseDigestHex,
    checkerIdentityDigestHex: DIGESTS.checkerIdentityDigestHex,
  });
  const stableErgoView = Object.freeze({
    ...binding(),
    check,
    revalidationDigestHex: DIGESTS.revalidationDigestHex,
    packageBindingDigestHex: DIGESTS.packageBindingDigestHex,
    signedTransactionDigestHex: DIGESTS.signedTransactionDigestHex,
    signerContextDigestHex: DIGESTS.signerContextDigestHex,
    checkResponseDigestHex: DIGESTS.checkResponseDigestHex,
    checkerIdentityDigestHex: DIGESTS.checkerIdentityDigestHex,
    viewDigestHex: DIGESTS.stableErgoViewDigestHex,
  });
  const stableSidechainView = Object.freeze({
    ...binding(),
    check,
    revalidationDigestHex: DIGESTS.revalidationDigestHex,
    packageBindingDigestHex: DIGESTS.packageBindingDigestHex,
    signedTransactionDigestHex: DIGESTS.signedTransactionDigestHex,
    signerContextDigestHex: DIGESTS.signerContextDigestHex,
    checkResponseDigestHex: DIGESTS.checkResponseDigestHex,
    checkerIdentityDigestHex: DIGESTS.checkerIdentityDigestHex,
    viewDigestHex: DIGESTS.stableSidechainViewDigestHex,
  });
  const checkAdmission = Object.freeze({
    ...binding(),
    check,
    stableErgoView,
    stableSidechainView,
    revalidationDigestHex: DIGESTS.revalidationDigestHex,
    packageBindingDigestHex: DIGESTS.packageBindingDigestHex,
    signedTransactionDigestHex: DIGESTS.signedTransactionDigestHex,
    signerContextDigestHex: DIGESTS.signerContextDigestHex,
    checkResponseDigestHex: DIGESTS.checkResponseDigestHex,
    checkerIdentityDigestHex: DIGESTS.checkerIdentityDigestHex,
    stableErgoViewDigestHex: DIGESTS.stableErgoViewDigestHex,
    stableSidechainViewDigestHex: DIGESTS.stableSidechainViewDigestHex,
    admissionDigestHex: DIGESTS.admissionDigestHex,
  });
  const checkJournal = Object.freeze({
    ...binding(),
    admission: checkAdmission,
    revalidationDigestHex: DIGESTS.revalidationDigestHex,
    packageBindingDigestHex: DIGESTS.packageBindingDigestHex,
    signedTransactionDigestHex: DIGESTS.signedTransactionDigestHex,
    signerContextDigestHex: DIGESTS.signerContextDigestHex,
    checkResponseDigestHex: DIGESTS.checkResponseDigestHex,
    checkerIdentityDigestHex: DIGESTS.checkerIdentityDigestHex,
    stableErgoViewDigestHex: DIGESTS.stableErgoViewDigestHex,
    stableSidechainViewDigestHex: DIGESTS.stableSidechainViewDigestHex,
    admissionDigestHex: DIGESTS.admissionDigestHex,
    applied: true,
    status: 'check_passed',
  });
  const authorization = Object.freeze({
    ...binding(),
    checkAdmission,
    checkJournal,
    revalidationDigestHex: DIGESTS.revalidationDigestHex,
    packageBindingDigestHex: DIGESTS.packageBindingDigestHex,
    signedTransactionDigestHex: DIGESTS.signedTransactionDigestHex,
    signerContextDigestHex: DIGESTS.signerContextDigestHex,
    checkResponseDigestHex: DIGESTS.checkResponseDigestHex,
    checkerIdentityDigestHex: DIGESTS.checkerIdentityDigestHex,
    stableErgoViewDigestHex: DIGESTS.stableErgoViewDigestHex,
    stableSidechainViewDigestHex: DIGESTS.stableSidechainViewDigestHex,
    admissionDigestHex: DIGESTS.admissionDigestHex,
    authorizationDigestHex: DIGESTS.authorizationDigestHex,
  });
  const reservationAdmission = Object.freeze({
    ...binding(),
    authorization,
    revalidationDigestHex: DIGESTS.revalidationDigestHex,
    packageBindingDigestHex: DIGESTS.packageBindingDigestHex,
    signedTransactionDigestHex: DIGESTS.signedTransactionDigestHex,
    signerContextDigestHex: DIGESTS.signerContextDigestHex,
    checkResponseDigestHex: DIGESTS.checkResponseDigestHex,
    checkerIdentityDigestHex: DIGESTS.checkerIdentityDigestHex,
    stableErgoViewDigestHex: DIGESTS.stableErgoViewDigestHex,
    stableSidechainViewDigestHex: DIGESTS.stableSidechainViewDigestHex,
    admissionDigestHex: DIGESTS.admissionDigestHex,
    authorizationDigestHex: DIGESTS.authorizationDigestHex,
    reservationDigestHex: DIGESTS.reservationDigestHex,
  });
  const reservation = Object.freeze({
    ...binding(),
    admission: reservationAdmission,
    revalidationDigestHex: DIGESTS.revalidationDigestHex,
    packageBindingDigestHex: DIGESTS.packageBindingDigestHex,
    signedTransactionDigestHex: DIGESTS.signedTransactionDigestHex,
    signerContextDigestHex: DIGESTS.signerContextDigestHex,
    checkResponseDigestHex: DIGESTS.checkResponseDigestHex,
    checkerIdentityDigestHex: DIGESTS.checkerIdentityDigestHex,
    stableErgoViewDigestHex: DIGESTS.stableErgoViewDigestHex,
    stableSidechainViewDigestHex: DIGESTS.stableSidechainViewDigestHex,
    admissionDigestHex: DIGESTS.admissionDigestHex,
    authorizationDigestHex: DIGESTS.authorizationDigestHex,
    reservationDigestHex: DIGESTS.reservationDigestHex,
    applied: true,
    status: 'active',
  });

  return {
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
  };
}

function dependencies(
  value: Fixture,
  events: string[],
): AuthenticatedSettlementCheckReservationApplicationDeps<
  Candidate,
  Prepared,
  SignedArtifact
> {
  return {
    revalidate: async input => {
      events.push('revalidate');
      expect(input).toBe(INPUT);
      return value.revalidation;
    },
    bindPackage: async revalidation => {
      events.push('bind-package');
      expect(revalidation).toBe(value.revalidation);
      return value.packageBinding;
    },
    sign: async packageBinding => {
      events.push('sign');
      expect(packageBinding).toBe(value.packageBinding);
      return value.signed;
    },
    check: async signed => {
      events.push('check');
      expect(signed).toBe(value.signed);
      return value.check;
    },
    observeStableErgo: async check => {
      events.push('observe-stable-ergo');
      expect(check).toBe(value.check);
      return value.stableErgoView;
    },
    observeStableSidechain: async check => {
      events.push('observe-stable-sidechain');
      expect(check).toBe(value.check);
      return value.stableSidechainView;
    },
    authorizeCheck: input => {
      events.push('authorize-check');
      expect(input.check).toBe(value.check);
      expect(input.stableErgoView).toBe(value.stableErgoView);
      expect(input.stableSidechainView).toBe(value.stableSidechainView);
      return value.checkAdmission;
    },
    recordCheck: admission => {
      events.push('record-check');
      expect(admission).toBe(value.checkAdmission);
      return value.checkJournal;
    },
    authorizeExecution: input => {
      events.push('authorize-execution');
      expect(input.checkAdmission).toBe(value.checkAdmission);
      expect(input.checkJournal).toBe(value.checkJournal);
      return value.authorization;
    },
    authorizeReservation: authorization => {
      events.push('authorize-reservation');
      expect(authorization).toBe(value.authorization);
      return value.reservationAdmission;
    },
    reserveExecution: admission => {
      events.push('reserve-execution');
      expect(admission).toBe(value.reservationAdmission);
      return value.reservation;
    },
  };
}

describe('bridge-daemon authenticated settlement check-reservation composition', () => {
  it('assembles the exact check-to-durable-reservation order and identities', async () => {
    const events: string[] = [];
    const value = fixture();
    const deps = dependencies(value, events);

    expect(Object.keys(deps)).toEqual([
      'revalidate',
      'bindPackage',
      'sign',
      'check',
      'observeStableErgo',
      'observeStableSidechain',
      'authorizeCheck',
      'recordCheck',
      'authorizeExecution',
      'authorizeReservation',
      'reserveExecution',
    ]);
    expect('submitter' in deps).toBe(false);
    expect('transportReservationJournal' in deps).toBe(false);
    expect('broadcastAuthorization' in deps).toBe(false);
    expect('confirmationObservation' in deps).toBe(false);
    expect('fundsAuthority' in deps).toBe(false);

    const result = await runAuthenticatedSettlementCheckReservation(
      INPUT,
      deps,
    );

    expect(events).toEqual([
      'revalidate',
      'bind-package',
      'sign',
      'check',
      'observe-stable-ergo',
      'observe-stable-sidechain',
      'authorize-check',
      'record-check',
      'authorize-execution',
      'authorize-reservation',
      'reserve-execution',
    ]);
    expect(result.input).toBe(INPUT);
    expect(result.candidate).toBe(CANDIDATE);
    expect(result.revalidation).toBe(value.revalidation);
    expect(result.packageBinding).toBe(value.packageBinding);
    expect(result.signed).toBe(value.signed);
    expect(result.signedArtifact).toBe(SIGNED_ARTIFACT);
    expect(result.check).toBe(value.check);
    expect(result.stableErgoView).toBe(value.stableErgoView);
    expect(result.stableSidechainView).toBe(value.stableSidechainView);
    expect(result.checkAdmission).toBe(value.checkAdmission);
    expect(result.checkJournal).toBe(value.checkJournal);
    expect(result.authorization).toBe(value.authorization);
    expect(result.reservationAdmission).toBe(value.reservationAdmission);
    expect(result.reservation).toBe(value.reservation);
    expect(result.boundary).toEqual({
      laterExecutionRequired: true,
      submissionCapabilityPresent: false,
      fundsAuthorityGranted: false,
    });
  });

  it('stops before admission and journal mutation when an observation fails', async () => {
    const events: string[] = [];
    const value = fixture();
    const base = dependencies(value, events);
    const recordCheck = vi.fn(base.recordCheck);
    const authorizeExecution = vi.fn(base.authorizeExecution);
    const authorizeReservation = vi.fn(base.authorizeReservation);
    const reserveExecution = vi.fn(base.reserveExecution);
    const deps: AuthenticatedSettlementCheckReservationApplicationDeps<
      Candidate,
      Prepared,
      SignedArtifact
    > = {
      ...base,
      observeStableSidechain: async check => {
        events.push('observe-stable-sidechain');
        expect(check).toBe(value.check);
        throw new Error('sidechain RPC views disagree');
      },
      recordCheck,
      authorizeExecution,
      authorizeReservation,
      reserveExecution,
    };

    await expect(runAuthenticatedSettlementCheckReservation(INPUT, deps))
      .rejects.toThrow(/RPC views disagree/);

    expect(events).toEqual([
      'revalidate',
      'bind-package',
      'sign',
      'check',
      'observe-stable-ergo',
      'observe-stable-sidechain',
    ]);
    expect(recordCheck).not.toHaveBeenCalled();
    expect(authorizeExecution).not.toHaveBeenCalled();
    expect(authorizeReservation).not.toHaveBeenCalled();
    expect(reserveExecution).not.toHaveBeenCalled();
  });
});
