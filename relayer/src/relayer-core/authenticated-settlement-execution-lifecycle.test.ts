import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  AUTHENTICATED_SETTLEMENT_LIFECYCLE_SCHEMA,
  assertAuthenticatedSettlementLifecycleHandoffProvenance,
  assertAuthenticatedSettlementReservedHandoffProvenance,
  assertAuthenticatedSettlementTransportReservationRequestProvenance,
  executeAuthenticatedSettlementLifecycle,
  executeAuthenticatedSettlementReservedHandoff,
  prepareAuthenticatedSettlementExecutionReservation,
  reconcileAuthenticatedSettlementSubmission,
  type AuthenticatedSettlementConfirmationObservationStatus,
  type AuthenticatedSettlementDurableSubmissionIdentity,
  type AuthenticatedSettlementLifecycleInput,
  type AuthenticatedSettlementLifecyclePorts,
  type AuthenticatedSettlementRestartReconciliationPorts,
} from './authenticated-settlement-execution-lifecycle.js';

const CANDIDATE_ID = '01'.repeat(32);
const EXPECTED_TX_ID = '02'.repeat(32);
const UNSIGNED_TX_DIGEST = '03'.repeat(32);
const PACKAGE_DIGEST = '04'.repeat(32);
const PAYOUT_DIGEST = '05'.repeat(32);
const TRACKER_BOX_ID = '06'.repeat(32);
const DUP_BOX_ID = '07'.repeat(32);
const REVALIDATION_DIGEST = '08'.repeat(32);
const PACKAGE_BINDING_DIGEST = '09'.repeat(32);
const SIGNED_TX_DIGEST = '0a'.repeat(32);
const SIGNER_CONTEXT_DIGEST = '0b'.repeat(32);
const CHECK_RESPONSE_DIGEST = '0c'.repeat(32);
const CHECKER_IDENTITY_DIGEST = '0d'.repeat(32);
const ERGO_VIEW_DIGEST = '0e'.repeat(32);
const SIDECHAIN_VIEW_DIGEST = '0f'.repeat(32);
const ADMISSION_DIGEST = '10'.repeat(32);
const AUTHORIZATION_DIGEST = '11'.repeat(32);
const RESERVATION_DIGEST = '12'.repeat(32);
const PRE_SUBMIT_DIGEST = '13'.repeat(32);
const BROADCAST_AUTHORIZATION_DIGEST = '14'.repeat(32);
const TRANSPORT_RESERVATION_DIGEST = '15'.repeat(32);
const DURABLE_ATTEMPT_DIGEST = '16'.repeat(32);
const OBSERVATION_DIGEST = '17'.repeat(32);
const DRIFT = 'ff'.repeat(32);

type Stage =
  | 'revalidation'
  | 'packageBinding'
  | 'signed'
  | 'check'
  | 'stableErgoView'
  | 'stableSidechainView'
  | 'checkAdmission'
  | 'checkJournal'
  | 'authorization'
  | 'reservationAdmission'
  | 'reservation'
  | 'immediateRevalidation'
  | 'broadcastAuthorization'
  | 'transportReservation'
  | 'submission'
  | 'finalization'
  | 'confirmation'
  | 'confirmationJournal';

interface Candidate {
  readonly label: 'candidate';
}

interface Prepared {
  readonly label: 'prepared';
}

interface SignedArtifact {
  readonly bytes: Uint8Array;
}

interface FixtureOptions {
  readonly mutate?: Partial<Record<Stage, Record<string, unknown>>>;
  readonly failAt?: 'signer' | 'checker' | 'immediateRevalidation';
  readonly submit?: 'accepted' | 'rejected' | 'ambiguous' | 'null';
  readonly confirmation?: AuthenticatedSettlementConfirmationObservationStatus;
  readonly checkJournalApplied?: boolean;
  readonly checkJournalStatus?: string;
  readonly reservationApplied?: boolean;
  readonly reservationStatus?: string;
  readonly transportApplied?: boolean;
  readonly transportStatus?: string;
  readonly finalizationApplied?: boolean;
  readonly finalizationStatus?: string;
  readonly confirmationJournalApplied?: boolean;
  readonly confirmationJournalTerminalStateRetained?: boolean;
  readonly confirmationJournalStatus?: string;
}

function fixture(options: FixtureOptions = {}) {
  const events: string[] = [];
  const candidate: Candidate = { label: 'candidate' };
  const prepared: Prepared = { label: 'prepared' };
  const signedArtifact: SignedArtifact = {
    bytes: new Uint8Array([1, 2, 3, 4]),
  };
  const input: AuthenticatedSettlementLifecycleInput<Candidate> = {
    candidate,
    candidateId: CANDIDATE_ID,
    unsignedTxDigestHex: UNSIGNED_TX_DIGEST,
    unsignedPackageDigestHex: PACKAGE_DIGEST,
    payoutDigestHex: PAYOUT_DIGEST,
    trackerBoxId: TRACKER_BOX_ID,
    duplicatePreventionBoxId: DUP_BOX_ID,
  };
  const base = {
    candidate,
    candidateId: CANDIDATE_ID,
    expectedTxId: EXPECTED_TX_ID,
    unsignedTxDigestHex: UNSIGNED_TX_DIGEST,
    unsignedPackageDigestHex: PACKAGE_DIGEST,
    payoutDigestHex: PAYOUT_DIGEST,
    trackerBoxId: TRACKER_BOX_ID,
    duplicatePreventionBoxId: DUP_BOX_ID,
  };
  const checkedDigests = {
    revalidationDigestHex: REVALIDATION_DIGEST,
    packageBindingDigestHex: PACKAGE_BINDING_DIGEST,
    signedTransactionDigestHex: SIGNED_TX_DIGEST,
    signerContextDigestHex: SIGNER_CONTEXT_DIGEST,
    checkResponseDigestHex: CHECK_RESPONSE_DIGEST,
    checkerIdentityDigestHex: CHECKER_IDENTITY_DIGEST,
  };
  const admissionDigests = {
    ...checkedDigests,
    stableErgoViewDigestHex: ERGO_VIEW_DIGEST,
    stableSidechainViewDigestHex: SIDECHAIN_VIEW_DIGEST,
    admissionDigestHex: ADMISSION_DIGEST,
  };
  const reservationDigests = {
    ...admissionDigests,
    authorizationDigestHex: AUTHORIZATION_DIGEST,
    reservationDigestHex: RESERVATION_DIGEST,
  };
  const preSubmitDigests = {
    ...reservationDigests,
    preSubmitRevalidationDigestHex: PRE_SUBMIT_DIGEST,
  };
  const transportDigests = {
    ...preSubmitDigests,
    broadcastAuthorizationDigestHex: BROADCAST_AUTHORIZATION_DIGEST,
    transportReservationDigestHex: TRANSPORT_RESERVATION_DIGEST,
    durableAttemptDigestHex: DURABLE_ATTEMPT_DIGEST,
  };

  function mutate<T extends object>(stage: Stage, value: T): T {
    const patch = options.mutate?.[stage];
    return patch === undefined ? value : { ...value, ...patch };
  }

  const ports: AuthenticatedSettlementLifecyclePorts<
    Candidate,
    Prepared,
    SignedArtifact
  > = {
    revalidation: {
      revalidate: async exactInput => {
        events.push('revalidate');
        return mutate('revalidation', {
          ...base,
          input: exactInput,
          prepared,
          revalidationDigestHex: REVALIDATION_DIGEST,
        });
      },
    },
    packageBinding: {
      bind: async revalidation => {
        events.push('bind-package');
        return mutate('packageBinding', {
          ...base,
          revalidation,
          prepared: revalidation.prepared,
          revalidationDigestHex: REVALIDATION_DIGEST,
          packageBindingDigestHex: PACKAGE_BINDING_DIGEST,
        });
      },
    },
    signer: {
      sign: async packageBinding => {
        events.push('sign');
        if (options.failAt === 'signer') throw new Error('signer failed');
        return mutate('signed', {
          ...base,
          packageBinding,
          revalidationDigestHex: REVALIDATION_DIGEST,
          packageBindingDigestHex: PACKAGE_BINDING_DIGEST,
          signedTransactionDigestHex: SIGNED_TX_DIGEST,
          signerContextDigestHex: SIGNER_CONTEXT_DIGEST,
          signedArtifact,
        });
      },
    },
    checker: {
      check: async signed => {
        events.push('check');
        if (options.failAt === 'checker') throw new Error('checker failed');
        return mutate('check', {
          ...base,
          signed,
          ...checkedDigests,
        });
      },
    },
    stableErgoObservation: {
      observe: async check => {
        events.push('observe-ergo');
        return mutate('stableErgoView', {
          ...base,
          check,
          ...checkedDigests,
          viewDigestHex: ERGO_VIEW_DIGEST,
        });
      },
    },
    stableSidechainObservation: {
      observe: async check => {
        events.push('observe-sidechain');
        return mutate('stableSidechainView', {
          ...base,
          check,
          ...checkedDigests,
          viewDigestHex: SIDECHAIN_VIEW_DIGEST,
        });
      },
    },
    checkAdmission: {
      authorize: ({ check, stableErgoView, stableSidechainView }) => {
        events.push('authorize-check');
        return mutate('checkAdmission', {
          ...base,
          check,
          stableErgoView,
          stableSidechainView,
          ...admissionDigests,
        });
      },
    },
    checkJournal: {
      record: admission => {
        events.push('journal-check');
        return mutate('checkJournal', {
          ...base,
          admission,
          ...admissionDigests,
          applied: options.checkJournalApplied ?? true,
          status: options.checkJournalStatus ?? 'check_passed',
        });
      },
    },
    executionAuthorization: {
      authorize: ({ checkAdmission, checkJournal }) => {
        events.push('authorize-execution');
        return mutate('authorization', {
          ...base,
          checkAdmission,
          checkJournal,
          ...admissionDigests,
          authorizationDigestHex: AUTHORIZATION_DIGEST,
        });
      },
    },
    reservationAdmission: {
      authorize: authorization => {
        events.push('admit-reservation');
        return mutate('reservationAdmission', {
          ...base,
          authorization,
          ...reservationDigests,
        });
      },
    },
    executionReservationJournal: {
      reserve: admission => {
        events.push('reserve-execution');
        return mutate('reservation', {
          ...base,
          admission,
          ...reservationDigests,
          applied: options.reservationApplied ?? true,
          status: options.reservationStatus ?? 'active',
        });
      },
    },
    immediateRevalidation: {
      revalidate: async request => {
        events.push('revalidate-immediate');
        if (options.failAt === 'immediateRevalidation') {
          throw new Error('immediate revalidation failed');
        }
        return mutate('immediateRevalidation', {
          ...base,
          request,
          signedArtifact: request.signedArtifact,
          ...preSubmitDigests,
          status: 'valid',
        });
      },
    },
    broadcastAuthorization: {
      authorize: revalidation => {
        events.push('authorize-broadcast');
        return mutate('broadcastAuthorization', {
          ...base,
          revalidation,
          signedArtifact: revalidation.signedArtifact,
          ...preSubmitDigests,
          broadcastAuthorizationDigestHex: BROADCAST_AUTHORIZATION_DIGEST,
        });
      },
    },
    transportReservationJournal: {
      reserve: request => {
        events.push('reserve-transport');
        expect(() =>
          assertAuthenticatedSettlementTransportReservationRequestProvenance(
            request,
          )
        ).not.toThrow();
        expect(() =>
          assertAuthenticatedSettlementTransportReservationRequestProvenance({
            ...request,
          })
        ).toThrow(/provenance is missing/);
        return mutate('transportReservation', {
          ...base,
          authorization: request.authorization,
          signedArtifact: request.signedArtifact,
          ...transportDigests,
          applied: options.transportApplied ?? true,
          status: options.transportStatus ?? 'active',
        });
      },
    },
    submitter: {
      submit: async request => {
        events.push('submit');
        if (options.submit === 'null') return null;
        const status: 'accepted' | 'rejected' | 'ambiguous' =
          options.submit === 'rejected'
            ? 'rejected'
            : options.submit === 'ambiguous'
              ? 'ambiguous'
              : 'accepted';
        return mutate('submission', {
          ...base,
          request,
          signedArtifact: request.signedArtifact,
          ...transportDigests,
          status,
          submittedTxId:
            options.submit === 'accepted' || options.submit === undefined
              ? EXPECTED_TX_ID
              : null,
        });
      },
    },
    submissionJournal: {
      finalize: ({ request, submission }) => {
        events.push('finalize-submission');
        const accepted = submission?.status === 'accepted';
        const rejected = submission?.status === 'rejected';
        return mutate('finalization', {
          ...base,
          request,
          submission,
          ...transportDigests,
          durableAttemptDigestHex: DURABLE_ATTEMPT_DIGEST,
          applied: options.finalizationApplied ?? true,
          status:
            options.finalizationStatus
              ?? (accepted ? 'submitted' : rejected ? 'rejected' : 'pending'),
          submittedTxId: accepted ? EXPECTED_TX_ID : null,
        });
      },
    },
    confirmationObservation: {
      observe: async finalization => {
        events.push('observe-confirmation');
        return mutate('confirmation', {
          ...base,
          finalization,
          ...transportDigests,
          durableAttemptDigestHex: DURABLE_ATTEMPT_DIGEST,
          observationDigestHex: OBSERVATION_DIGEST,
          status: options.confirmation ?? 'confirmed',
        });
      },
    },
    confirmationJournal: {
      record: observation => {
        events.push('journal-confirmation');
        const defaultStatus =
          observation.status === 'confirmed'
            ? 'confirmed'
            : observation.status === 'submitted_unconfirmed'
              ? 'submitted'
              : observation.status === 'inconclusive'
                ? 'pending_reconciliation'
                : 'quarantined';
        return mutate('confirmationJournal', {
          ...base,
          observation,
          ...transportDigests,
          durableAttemptDigestHex: DURABLE_ATTEMPT_DIGEST,
          observationDigestHex: OBSERVATION_DIGEST,
          applied: options.confirmationJournalApplied ?? true,
          terminalStateRetained:
            options.confirmationJournalTerminalStateRetained,
          status: options.confirmationJournalStatus ?? defaultStatus,
        });
      },
    },
  };

  return { events, input, ports, candidate, prepared, signedArtifact };
}

describe('authenticated settlement execution lifecycle core', () => {
  it('exposes a branded check-only handoff without requiring later execution ports', async () => {
    const value = fixture();
    const reserved = await prepareAuthenticatedSettlementExecutionReservation(
      value.input,
      {
        revalidation: value.ports.revalidation,
        packageBinding: value.ports.packageBinding,
        signer: value.ports.signer,
        checker: value.ports.checker,
        stableErgoObservation: value.ports.stableErgoObservation,
        stableSidechainObservation: value.ports.stableSidechainObservation,
        checkAdmission: value.ports.checkAdmission,
        checkJournal: value.ports.checkJournal,
        executionAuthorization: value.ports.executionAuthorization,
        reservationAdmission: value.ports.reservationAdmission,
        executionReservationJournal:
          value.ports.executionReservationJournal,
      },
    );

    expect(value.events).toEqual([
      'revalidate',
      'bind-package',
      'sign',
      'check',
      'observe-ergo',
      'observe-sidechain',
      'authorize-check',
      'journal-check',
      'authorize-execution',
      'admit-reservation',
      'reserve-execution',
    ]);
    expect(reserved.boundary).toEqual({
      laterExecutionRequired: true,
      submissionCapabilityPresent: false,
      fundsAuthorityGranted: false,
    });
    expect(reserved.signedArtifact).toBe(value.signedArtifact);
    expect(Object.isFrozen(reserved)).toBe(true);
    expect(Object.isFrozen(reserved.identity)).toBe(true);
    expect(() =>
      assertAuthenticatedSettlementReservedHandoffProvenance(reserved)
    ).not.toThrow();
    expect(() =>
      assertAuthenticatedSettlementReservedHandoffProvenance({ ...reserved })
    ).toThrow(/provenance is missing/);
  });

  it('continues only the exact reserved handoff through later execution', async () => {
    const value = fixture();
    const reserved = await prepareAuthenticatedSettlementExecutionReservation(
      value.input,
      {
        revalidation: value.ports.revalidation,
        packageBinding: value.ports.packageBinding,
        signer: value.ports.signer,
        checker: value.ports.checker,
        stableErgoObservation: value.ports.stableErgoObservation,
        stableSidechainObservation: value.ports.stableSidechainObservation,
        checkAdmission: value.ports.checkAdmission,
        checkJournal: value.ports.checkJournal,
        executionAuthorization: value.ports.executionAuthorization,
        reservationAdmission: value.ports.reservationAdmission,
        executionReservationJournal:
          value.ports.executionReservationJournal,
      },
    );
    const result = await executeAuthenticatedSettlementReservedHandoff(
      reserved,
      {
        immediateRevalidation: value.ports.immediateRevalidation,
        broadcastAuthorization: value.ports.broadcastAuthorization,
        transportReservationJournal:
          value.ports.transportReservationJournal,
        submitter: value.ports.submitter,
        submissionJournal: value.ports.submissionJournal,
        confirmationObservation: value.ports.confirmationObservation,
        confirmationJournal: value.ports.confirmationJournal,
      },
    );

    expect(result.status).toBe('confirmed');
    expect(result.signedArtifact).toBe(value.signedArtifact);
    expect(value.events.slice(11)).toEqual([
      'revalidate-immediate',
      'authorize-broadcast',
      'reserve-transport',
      'submit',
      'finalize-submission',
      'observe-confirmation',
      'journal-confirmation',
    ]);
  });

  it('rejects a cloned reserved handoff before immediate revalidation', async () => {
    const value = fixture();
    const reserved = await prepareAuthenticatedSettlementExecutionReservation(
      value.input,
      {
        revalidation: value.ports.revalidation,
        packageBinding: value.ports.packageBinding,
        signer: value.ports.signer,
        checker: value.ports.checker,
        stableErgoObservation: value.ports.stableErgoObservation,
        stableSidechainObservation: value.ports.stableSidechainObservation,
        checkAdmission: value.ports.checkAdmission,
        checkJournal: value.ports.checkJournal,
        executionAuthorization: value.ports.executionAuthorization,
        reservationAdmission: value.ports.reservationAdmission,
        executionReservationJournal:
          value.ports.executionReservationJournal,
      },
    );
    await expect(
      executeAuthenticatedSettlementReservedHandoff(
        { ...reserved },
        {
          immediateRevalidation: value.ports.immediateRevalidation,
          broadcastAuthorization: value.ports.broadcastAuthorization,
          transportReservationJournal:
            value.ports.transportReservationJournal,
          submitter: value.ports.submitter,
          submissionJournal: value.ports.submissionJournal,
          confirmationObservation: value.ports.confirmationObservation,
          confirmationJournal: value.ports.confirmationJournal,
        },
      ),
    ).rejects.toThrow(/reserved handoff provenance is missing/);
    expect(value.events).not.toContain('revalidate-immediate');
  });

  it('rechecks reserved stage digests before immediate revalidation', async () => {
    const value = fixture();
    const reserved = await prepareAuthenticatedSettlementExecutionReservation(
      value.input,
      {
        revalidation: value.ports.revalidation,
        packageBinding: value.ports.packageBinding,
        signer: value.ports.signer,
        checker: value.ports.checker,
        stableErgoObservation: value.ports.stableErgoObservation,
        stableSidechainObservation: value.ports.stableSidechainObservation,
        checkAdmission: value.ports.checkAdmission,
        checkJournal: value.ports.checkJournal,
        executionAuthorization: value.ports.executionAuthorization,
        reservationAdmission: value.ports.reservationAdmission,
        executionReservationJournal:
          value.ports.executionReservationJournal,
      },
    );
    (reserved.signed as unknown as Record<string, unknown>)
      .signedTransactionDigestHex = DRIFT;

    await expect(
      executeAuthenticatedSettlementReservedHandoff(
        reserved,
        {
          immediateRevalidation: value.ports.immediateRevalidation,
          broadcastAuthorization: value.ports.broadcastAuthorization,
          transportReservationJournal:
            value.ports.transportReservationJournal,
          submitter: value.ports.submitter,
          submissionJournal: value.ports.submissionJournal,
          confirmationObservation: value.ports.confirmationObservation,
          confirmationJournal: value.ports.confirmationJournal,
        },
      ),
    ).rejects.toThrow(/signedTransactionDigestHex does not match/);
    expect(value.events).not.toContain('revalidate-immediate');
  });

  it('orders the complete checked, reserved, submitted, and confirmed lifecycle', async () => {
    const value = fixture();
    const result = await executeAuthenticatedSettlementLifecycle(
      value.input,
      value.ports,
    );

    expect(value.events).toEqual([
      'revalidate',
      'bind-package',
      'sign',
      'check',
      'observe-ergo',
      'observe-sidechain',
      'authorize-check',
      'journal-check',
      'authorize-execution',
      'admit-reservation',
      'reserve-execution',
      'revalidate-immediate',
      'authorize-broadcast',
      'reserve-transport',
      'submit',
      'finalize-submission',
      'observe-confirmation',
      'journal-confirmation',
    ]);
    expect(result).toMatchObject({
      schema: AUTHENTICATED_SETTLEMENT_LIFECYCLE_SCHEMA,
      status: 'confirmed',
      boundary: {
        portsAloneGrantFundsAuthority: false,
        freshRestartCannotRecreateEphemeralAuthority: true,
      },
    });
    expect(result.signedArtifact).toBe(value.signedArtifact);
    expect(result.submission?.signedArtifact).toBe(value.signedArtifact);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.boundary)).toBe(true);
    expect(Object.isFrozen(value.signedArtifact)).toBe(false);
    expect(() =>
      assertAuthenticatedSettlementLifecycleHandoffProvenance(result)
    ).not.toThrow();
    expect(() =>
      assertAuthenticatedSettlementLifecycleHandoffProvenance({ ...result })
    ).toThrow(/provenance is missing/);
  });

  it('rejects non-canonical uppercase input identity before port access', async () => {
    const value = fixture();
    await expect(
      executeAuthenticatedSettlementLifecycle(
        { ...value.input, candidateId: 'AA'.repeat(32) },
        value.ports,
      ),
    ).rejects.toThrow(/canonical 32-byte lowercase hex/);
    expect(value.events).toEqual([]);
  });

  it.each([
    ['signer', ['revalidate', 'bind-package', 'sign']],
    ['checker', ['revalidate', 'bind-package', 'sign', 'check']],
  ] as const)('stops after a %s failure', async (failAt, expectedEvents) => {
    const value = fixture({ failAt });
    await expect(
      executeAuthenticatedSettlementLifecycle(value.input, value.ports),
    ).rejects.toThrow(new RegExp(`${failAt} failed`));
    expect(value.events).toEqual(expectedEvents);
  });

  it('finishes both stable observations before any check journal mutation', async () => {
    const value = fixture();
    await executeAuthenticatedSettlementLifecycle(value.input, value.ports);
    expect(value.events.indexOf('observe-ergo')).toBeLessThan(
      value.events.indexOf('journal-check'),
    );
    expect(value.events.indexOf('observe-sidechain')).toBeLessThan(
      value.events.indexOf('journal-check'),
    );
  });

  const mismatchCases: ReadonlyArray<
    readonly [Stage, 'candidateId' | 'expectedTxId' | 'digest', string]
  > = [
    ['revalidation', 'candidateId', 'candidateId'],
    ['revalidation', 'expectedTxId', 'expectedTxId'],
    ['revalidation', 'digest', 'unsignedTxDigestHex'],
    ['packageBinding', 'candidateId', 'candidateId'],
    ['packageBinding', 'expectedTxId', 'expectedTxId'],
    ['packageBinding', 'digest', 'revalidationDigestHex'],
    ['signed', 'candidateId', 'candidateId'],
    ['signed', 'expectedTxId', 'expectedTxId'],
    ['signed', 'digest', 'packageBindingDigestHex'],
    ['check', 'candidateId', 'candidateId'],
    ['check', 'expectedTxId', 'expectedTxId'],
    ['check', 'digest', 'signedTransactionDigestHex'],
    ['stableErgoView', 'candidateId', 'candidateId'],
    ['stableErgoView', 'expectedTxId', 'expectedTxId'],
    ['stableErgoView', 'digest', 'checkerIdentityDigestHex'],
    ['stableSidechainView', 'candidateId', 'candidateId'],
    ['stableSidechainView', 'expectedTxId', 'expectedTxId'],
    ['stableSidechainView', 'digest', 'checkerIdentityDigestHex'],
    ['checkAdmission', 'candidateId', 'candidateId'],
    ['checkAdmission', 'expectedTxId', 'expectedTxId'],
    ['checkAdmission', 'digest', 'stableErgoViewDigestHex'],
    ['checkJournal', 'candidateId', 'candidateId'],
    ['checkJournal', 'expectedTxId', 'expectedTxId'],
    ['checkJournal', 'digest', 'admissionDigestHex'],
    ['authorization', 'candidateId', 'candidateId'],
    ['authorization', 'expectedTxId', 'expectedTxId'],
    ['authorization', 'digest', 'admissionDigestHex'],
    ['reservationAdmission', 'candidateId', 'candidateId'],
    ['reservationAdmission', 'expectedTxId', 'expectedTxId'],
    ['reservationAdmission', 'digest', 'authorizationDigestHex'],
    ['reservation', 'candidateId', 'candidateId'],
    ['reservation', 'expectedTxId', 'expectedTxId'],
    ['reservation', 'digest', 'reservationDigestHex'],
    ['immediateRevalidation', 'candidateId', 'candidateId'],
    ['immediateRevalidation', 'expectedTxId', 'expectedTxId'],
    ['immediateRevalidation', 'digest', 'reservationDigestHex'],
    ['broadcastAuthorization', 'candidateId', 'candidateId'],
    ['broadcastAuthorization', 'expectedTxId', 'expectedTxId'],
    ['broadcastAuthorization', 'digest', 'preSubmitRevalidationDigestHex'],
    ['transportReservation', 'candidateId', 'candidateId'],
    ['transportReservation', 'expectedTxId', 'expectedTxId'],
    ['transportReservation', 'digest', 'broadcastAuthorizationDigestHex'],
    ['submission', 'candidateId', 'candidateId'],
    ['submission', 'expectedTxId', 'expectedTxId'],
    ['submission', 'digest', 'transportReservationDigestHex'],
    ['finalization', 'candidateId', 'candidateId'],
    ['finalization', 'expectedTxId', 'expectedTxId'],
    ['finalization', 'digest', 'transportReservationDigestHex'],
    ['confirmation', 'candidateId', 'candidateId'],
    ['confirmation', 'expectedTxId', 'expectedTxId'],
    ['confirmation', 'digest', 'durableAttemptDigestHex'],
    ['confirmationJournal', 'candidateId', 'candidateId'],
    ['confirmationJournal', 'expectedTxId', 'expectedTxId'],
    ['confirmationJournal', 'digest', 'observationDigestHex'],
  ];

  it.each(mismatchCases)(
    'rejects %s %s drift',
    async (stage, _kind, field) => {
      const value = fixture({
        mutate: { [stage]: { [field]: DRIFT } },
      });
      await expect(
        executeAuthenticatedSettlementLifecycle(value.input, value.ports),
      ).rejects.toThrow(/does not match|canonical 32-byte/);
    },
  );

  it.each([
    [{ checkJournalApplied: false }, /check journal compare-and-set/],
    [{ checkJournalStatus: 'prepared' }, /check journal returned unsupported/],
    [{ reservationApplied: false }, /execution reservation journal compare-and-set/],
    [{ reservationStatus: 'revoked' }, /execution reservation journal returned unsupported/],
    [{ transportApplied: false }, /transport reservation journal compare-and-set/],
    [{ transportStatus: 'revoked' }, /transport reservation journal returned unsupported/],
    [{ finalizationApplied: false }, /submission journal compare-and-set/],
    [{ finalizationStatus: 'confirmed' }, /submission journal returned unsupported/],
    [{ confirmationJournalApplied: false }, /confirmation journal compare-and-set/],
    [{ confirmationJournalStatus: 'submitted' }, /does not match observation/],
  ] as const)('rejects false or unsupported journal output %#', async (options, error) => {
    const value = fixture(options);
    await expect(
      executeAuthenticatedSettlementLifecycle(value.input, value.ports),
    ).rejects.toThrow(error);
  });

  it('prevents transport access when immediate revalidation fails', async () => {
    const value = fixture({ failAt: 'immediateRevalidation' });
    await expect(
      executeAuthenticatedSettlementLifecycle(value.input, value.ports),
    ).rejects.toThrow(/immediate revalidation failed/);
    expect(value.events).not.toContain('authorize-broadcast');
    expect(value.events).not.toContain('reserve-transport');
    expect(value.events).not.toContain('submit');
  });

  it('rejects a changed signed artifact even with the same transaction ID and digest', async () => {
    const value = fixture({
      mutate: {
        submission: {
          signedArtifact: { bytes: new Uint8Array([1, 2, 3, 4]) },
        },
      },
    });
    await expect(
      executeAuthenticatedSettlementLifecycle(value.input, value.ports),
    ).rejects.toThrow(/submitted signed artifact must retain exact object identity/);
    expect(value.events).not.toContain('finalize-submission');
  });

  it('rejects a changed signed digest even with the same transaction ID', async () => {
    const value = fixture({
      mutate: {
        submission: { signedTransactionDigestHex: DRIFT },
      },
    });
    await expect(
      executeAuthenticatedSettlementLifecycle(value.input, value.ports),
    ).rejects.toThrow(/signedTransactionDigestHex does not match/);
    expect(value.events).not.toContain('finalize-submission');
  });

  it.each(['null', 'ambiguous'] as const)(
    'keeps a %s submit outcome pending for reconciliation without observing confirmation',
    async submit => {
      const value = fixture({ submit });
      const result = await executeAuthenticatedSettlementLifecycle(
        value.input,
        value.ports,
      );
      expect(result.status).toBe('pending_reconciliation');
      expect(result.finalization.status).toBe('pending');
      expect(result.confirmation).toBeNull();
      expect(value.events).not.toContain('observe-confirmation');
    },
  );

  it('fails closed on a certain transport rejection without observing confirmation', async () => {
    const value = fixture({ submit: 'rejected' });
    const result = await executeAuthenticatedSettlementLifecycle(
      value.input,
      value.ports,
    );
    expect(result.status).toBe('fail_closed');
    expect(result.finalization.status).toBe('rejected');
    expect(result.finalization.submittedTxId).toBeNull();
    expect(result.confirmation).toBeNull();
    expect(value.events).not.toContain('observe-confirmation');
  });

  it('persists the exact attempt before transport so a post-submit crash reconciles without resubmission', async () => {
    const value = fixture();
    value.ports.submitter.submit = async () => {
      value.events.push('submit');
      throw new Error('process stopped after transport accepted the bytes');
    };

    await expect(
      executeAuthenticatedSettlementLifecycle(value.input, value.ports),
    ).rejects.toThrow(/process stopped after transport/);
    expect(value.events.indexOf('reserve-transport')).toBeLessThan(
      value.events.indexOf('submit'),
    );
    expect(value.events).not.toContain('finalize-submission');

    const reconciliationEvents: string[] = [];
    const result = await reconcileAuthenticatedSettlementSubmission(
      durable({ status: 'pending' }),
      restartPorts(reconciliationEvents, { observation: 'confirmed' }),
    );
    expect(result.status).toBe('confirmed');
    expect(reconciliationEvents).toEqual(['observe', 'journal']);
    expect(value.events.filter(event => event === 'submit')).toHaveLength(1);
  });

  it.each([
    ['submitted_unconfirmed', 'submitted'],
    ['confirmed', 'confirmed'],
    ['inconclusive', 'pending_reconciliation'],
    ['stale', 'fail_closed'],
    ['reorged', 'fail_closed'],
  ] as const)('maps %s confirmation to %s', async (confirmation, status) => {
    const value = fixture({ confirmation });
    const result = await executeAuthenticatedSettlementLifecycle(
      value.input,
      value.ports,
    );
    expect(result.status).toBe(status);
    if (confirmation === 'stale' || confirmation === 'reorged') {
      expect(value.events).toContain('journal-confirmation');
      expect(result.confirmationJournal?.status).toBe('quarantined');
    }
  });

  it('lets a concurrent terminal quarantine dominate an earlier nonterminal observation', async () => {
    const value = fixture({
      confirmation: 'submitted_unconfirmed',
      confirmationJournalApplied: false,
      confirmationJournalTerminalStateRetained: true,
      confirmationJournalStatus: 'quarantined',
    });
    const result = await executeAuthenticatedSettlementLifecycle(
      value.input,
      value.ports,
    );

    expect(result.status).toBe('fail_closed');
    expect(result.confirmationJournal?.applied).toBe(false);
    expect(result.confirmationJournal?.terminalStateRetained).toBe(true);
    expect(result.confirmationJournal?.status).toBe('quarantined');
  });

  it('rejects terminal-retention evidence for a nonterminal journal state', async () => {
    const value = fixture({
      confirmation: 'submitted_unconfirmed',
      confirmationJournalApplied: false,
      confirmationJournalTerminalStateRetained: true,
      confirmationJournalStatus: 'submitted',
    });

    await expect(
      executeAuthenticatedSettlementLifecycle(value.input, value.ports),
    ).rejects.toThrow(/confirmation journal compare-and-set did not apply/);
  });

  it.each([
    ['payoutDigestHex', PAYOUT_DIGEST],
    ['trackerBoxId', TRACKER_BOX_ID],
    ['duplicatePreventionBoxId', DUP_BOX_ID],
  ] as const)(
    'rejects confirmation with wrong %s before confirmation journal access',
    async (field, _expected) => {
      const value = fixture({
        mutate: { confirmation: { [field]: DRIFT } },
      });
      await expect(
        executeAuthenticatedSettlementLifecycle(value.input, value.ports),
      ).rejects.toThrow(/does not match/);
      expect(value.events).not.toContain('journal-confirmation');
    },
  );

  it('rejects confirmation observation before durable submitted finalization', async () => {
    const value = fixture({ finalizationStatus: 'pending' });
    await expect(
      executeAuthenticatedSettlementLifecycle(value.input, value.ports),
    ).rejects.toThrow(/submission journal returned unsupported status/);
    expect(value.events).not.toContain('observe-confirmation');
  });

  it.each([
    ['revalidation', 'input', 'bind-package'],
    ['packageBinding', 'revalidation', 'sign'],
    ['check', 'signed', 'observe-ergo'],
    ['stableSidechainView', 'check', 'authorize-check'],
    ['authorization', 'checkJournal', 'admit-reservation'],
    ['immediateRevalidation', 'request', 'authorize-broadcast'],
    ['broadcastAuthorization', 'revalidation', 'reserve-transport'],
    ['transportReservation', 'authorization', 'submit'],
    ['submission', 'request', 'finalize-submission'],
    ['confirmation', 'finalization', 'journal-confirmation'],
  ] as const)(
    'rejects out-of-order %s parent substitution before %s',
    async (stage, field, forbiddenEvent) => {
      const value = fixture({
        mutate: { [stage]: { [field]: {} } },
      });
      await expect(
        executeAuthenticatedSettlementLifecycle(value.input, value.ports),
      ).rejects.toThrow(/must retain exact object identity/);
      expect(value.events).not.toContain(forbiddenEvent);
    },
  );

  it('keeps the pure core free of imports and direct network APIs', () => {
    const source = readFileSync(
      new URL('./authenticated-settlement-execution-lifecycle.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/^import\s/m);
    expect(source).not.toMatch(/createHash|fetch\(|axios|JsonRpcProvider|WebSocket/);
  });
});

function durable(
  overrides: Partial<AuthenticatedSettlementDurableSubmissionIdentity> = {},
): AuthenticatedSettlementDurableSubmissionIdentity {
  return {
    candidateId: CANDIDATE_ID,
    expectedTxId: EXPECTED_TX_ID,
    unsignedTxDigestHex: UNSIGNED_TX_DIGEST,
    unsignedPackageDigestHex: PACKAGE_DIGEST,
    payoutDigestHex: PAYOUT_DIGEST,
    trackerBoxId: TRACKER_BOX_ID,
    duplicatePreventionBoxId: DUP_BOX_ID,
    status: 'submitted',
    submissionAttempted: true,
    signedTransactionDigestHex: SIGNED_TX_DIGEST,
    transportReservationDigestHex: TRANSPORT_RESERVATION_DIGEST,
    durableAttemptDigestHex: DURABLE_ATTEMPT_DIGEST,
    ...overrides,
  };
}

function restartPorts(
  events: string[],
  options: {
    observation?: AuthenticatedSettlementConfirmationObservationStatus;
    observationPatch?: Record<string, unknown>;
    journalApplied?: boolean;
    journalStatus?: string;
  } = {},
): AuthenticatedSettlementRestartReconciliationPorts {
  return {
    observation: {
      observe: async value => {
        events.push('observe');
        return {
          ...value,
          durable: value,
          status: options.observation ?? 'confirmed',
          observationDigestHex: OBSERVATION_DIGEST,
          ...options.observationPatch,
        };
      },
    },
    journal: {
      record: ({ observation }) => {
        events.push('journal');
        const defaultStatus =
          observation.status === 'confirmed'
            ? 'confirmed'
            : observation.status === 'submitted_unconfirmed'
              ? 'submitted'
              : observation.status === 'inconclusive'
                ? 'pending_reconciliation'
                : 'quarantined';
        return {
          ...observation,
          observation,
          applied: options.journalApplied ?? true,
          status: options.journalStatus ?? defaultStatus,
        };
      },
    },
  };
}

describe('authenticated settlement restart reconciliation core', () => {
  it.each([
    ['confirmed', 'confirmed'],
    ['submitted_unconfirmed', 'submitted'],
    ['inconclusive', 'pending_reconciliation'],
    ['stale', 'fail_closed'],
    ['reorged', 'fail_closed'],
  ] as const)('reconciles %s as %s from durable identity only', async (observation, status) => {
    const events: string[] = [];
    const result = await reconcileAuthenticatedSettlementSubmission(
      durable(),
      restartPorts(events, { observation }),
    );
    expect(result.status).toBe(status);
    expect(result.boundary).toEqual({
      durableIdentityIsFundsAuthority: false,
      ephemeralAuthorityRestored: false,
    });
    expect(events).toEqual(['observe', 'journal']);
    if (observation === 'stale' || observation === 'reorged') {
      expect(result.journal?.status).toBe('quarantined');
    }
  });

  it.each([
    ['payoutDigestHex', PAYOUT_DIGEST],
    ['trackerBoxId', TRACKER_BOX_ID],
    ['duplicatePreventionBoxId', DUP_BOX_ID],
  ] as const)('rejects wrong %s before restart journal access', async (field, _expected) => {
    const events: string[] = [];
    await expect(
      reconcileAuthenticatedSettlementSubmission(
        durable(),
        restartPorts(events, { observationPatch: { [field]: DRIFT } }),
      ),
    ).rejects.toThrow(/does not match/);
    expect(events).toEqual(['observe']);
  });

  it('rejects confirmation without a durable submission attempt', async () => {
    const events: string[] = [];
    await expect(
      reconcileAuthenticatedSettlementSubmission(
        durable({ submissionAttempted: false as true }),
        restartPorts(events),
      ),
    ).rejects.toThrow(/requires one durable attempted submission/);
    expect(events).toEqual([]);
  });

  it('rejects a replayed restart journal compare-and-set', async () => {
    await expect(
      reconcileAuthenticatedSettlementSubmission(
        durable(),
        restartPorts([], { journalApplied: false }),
      ),
    ).rejects.toThrow(/compare-and-set did not apply/);
  });

  it('accepts a serialized durable identity but exposes no ephemeral authority ports', async () => {
    const serialized = structuredClone(durable({ status: 'pending' }));
    const events: string[] = [];
    const result = await reconcileAuthenticatedSettlementSubmission(
      serialized,
      restartPorts(events, { observation: 'inconclusive' }),
    );
    expect(result.status).toBe('pending_reconciliation');
    const source = reconcileAuthenticatedSettlementSubmission.toString();
    expect(source).not.toMatch(/signer|checker|broadcastAuthorization|signedArtifact/);
  });

  it('keeps a confirmed durable identity observable for later reorg detection', async () => {
    const events: string[] = [];
    const result = await reconcileAuthenticatedSettlementSubmission(
      durable({ status: 'confirmed' }),
      restartPorts(events, { observation: 'stale' }),
    );

    expect(result.status).toBe('fail_closed');
    expect(result.journal?.status).toBe('quarantined');
    expect(events).toEqual(['observe', 'journal']);
  });
});
