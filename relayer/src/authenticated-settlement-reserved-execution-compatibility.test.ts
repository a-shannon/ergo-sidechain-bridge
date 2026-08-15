import { describe, expect, it, vi } from 'vitest';

const signerProvenance = vi.hoisted(() => ({
  assert: vi.fn(),
}));

vi.mock('./authenticated-settlement-jvm-check.js', () => ({
  assertAuthenticatedSettlementSignedCheckCandidateProvenance:
    signerProvenance.assert,
}));

import {
  createMatchingAggregateSettlementErgoObservationSources,
  type AggregateSettlementErgoObservationClient,
} from './adapters/aggregate-settlement-ergo-observation.js';
import {
  deriveAuthenticatedSettlementCandidateAuthorityDigest,
} from './authenticated-settlement-execution-reservation.js';
import {
  createAuthenticatedSettlementFixedSubmitter,
  createAuthenticatedSettlementReservedExecutionCompatibilityDeps,
  createAuthenticatedSettlementRestartCompatibilityDeps,
  reconcileRecoverableAuthenticatedSettlementSubmissionsCompatibility,
  runAuthenticatedSettlementReservedExecutionCompatibility,
  type AuthenticatedSettlementFixedSubmissionResult,
  type AuthenticatedSettlementFixedSubmitter,
} from './authenticated-settlement-reserved-execution-compatibility.js';
import {
  deriveSubstrateGrandpaV1AuthenticatedSettlementPayoutDigest,
} from './profiles/substrate-grandpa-v1/authenticated-settlement-payout-binding.js';
import {
  prepareAuthenticatedSettlementExecutionReservation,
  type AuthenticatedSettlementCheckReservationPorts,
  type AuthenticatedSettlementLifecycleInput,
} from './relayer-core/authenticated-settlement-execution-lifecycle.js';
import type {
  AuthenticatedSettlementCandidate,
  AuthenticatedSettlementExecutionReservation,
  AuthenticatedSettlementSubmissionAttempt,
  AuthenticatedSettlementSubmissionObservationResult,
  StateTracker,
} from './state-tracker.js';

const hex = (byte: string): string => byte.repeat(32);

const CANDIDATE_ID = hex('01');
const BURN_ID = hex('02');
const BURN_TX_HASH = hex('03');
const SIDECHAIN_ID = hex('04');
const EXECUTION_BLOCK_HASH = hex('05');
const TRACKER_BOX_ID = hex('06');
const DUP_BOX_ID = hex('07');
const VAULT_BOX_ID = hex('08');
const UNSIGNED_TX_DIGEST = hex('09');
const EXPECTED_TX_ID = hex('0a');
const PACKAGE_DIGEST = hex('0b');
const SIGNED_TX_DIGEST = hex('0c');
const REVALIDATION_DIGEST = hex('0d');
const PACKAGE_BINDING_DIGEST = hex('0e');
const SIGNER_CONTEXT_DIGEST = hex('0f');
const CHECK_RESPONSE_DIGEST = hex('10');
const CHECKER_IDENTITY_DIGEST = hex('11');
const ERGO_VIEW_DIGEST = hex('12');
const SIDECHAIN_VIEW_DIGEST = hex('13');
const ADMISSION_DIGEST = hex('14');
const AUTHORIZATION_DIGEST = hex('15');
const RESERVATION_DIGEST = hex('16');
const FINALITY_PROOF_DIGEST = hex('17');
const CURRENT_ERGO_VIEW_DIGEST = hex('18');
const CURRENT_SIDECHAIN_VIEW_DIGEST = hex('19');
const APPROVAL_DIGEST = hex('1a');
const RESPONSE_DIGEST = hex('1b');
const RECIPIENT_ERGO_TREE = `0008cd02${hex('21')}`;
const AMOUNT_NANOERG = 10_000_000n;

const CANDIDATE: AuthenticatedSettlementCandidate = Object.freeze({
  schemaVersion: 2,
  candidateId: CANDIDATE_ID,
  burnId: BURN_ID,
  burnTxHash: BURN_TX_HASH,
  sidechainId: SIDECHAIN_ID,
  sidechainHeight: 30n,
  sidechainBlockHash: EXECUTION_BLOCK_HASH,
  sidechainLogIndex: 2,
  trackerKey: hex('22'),
  trackerValue: hex('23'),
  trackerBoxId: TRACKER_BOX_ID,
  anchorHeaderId: hex('24'),
  anchorHeaderHeight: 100,
  dupInputBoxId: DUP_BOX_ID,
  dupInputDigest: hex('25'),
  vaultBoxId: VAULT_BOX_ID,
  unsignedTxDigest: UNSIGNED_TX_DIGEST,
  creationHeight: 100,
  observedSidechainTip: 40n,
  observedErgoTip: 120,
  status: 'check_passed',
  recoverySchema: null,
  recoverySidechainConsensusDigest: null,
  recoveryAdmissionDigest: null,
  recoverySidechainTipHash: null,
  recoverySidechainSourceCount: null,
  checkExpectedTxId: EXPECTED_TX_ID,
  checkUnsignedPackageDigest: PACKAGE_DIGEST,
  checkSignedTransactionDigest: SIGNED_TX_DIGEST,
  checkResponseDigest: CHECK_RESPONSE_DIGEST,
  checkSignerContextDigest: SIGNER_CONTEXT_DIGEST,
  checkCheckerIdentityDigest: CHECKER_IDENTITY_DIGEST,
  checkRevalidationDigest: REVALIDATION_DIGEST,
  checkNativeVerificationRequestDigest: hex('26'),
  checkTrustAnchorDigest: hex('27'),
  checkFinalityHorizonHash: hex('28'),
  checkFinalityHorizonHeight: 30n,
  checkFinalityStatementDigest: hex('29'),
  checkFinalityProgramId: hex('2a'),
  checkFinalityProofSystemId: 1,
  checkFinalityVerifierProfileId: hex('2b'),
  checkFinalityProofPayloadDigest: hex('2c'),
  checkFinalityProofDigest: FINALITY_PROOF_DIGEST,
  checkStableErgoViewDigest: ERGO_VIEW_DIGEST,
  checkStableSidechainViewDigest: SIDECHAIN_VIEW_DIGEST,
  checkAdmissionDigest: ADMISSION_DIGEST,
  invalidationReason: null,
  createdAt: '2026-07-29T00:00:00.000Z',
  updatedAt: '2026-07-29T00:00:00.000Z',
});

const PAYOUT_DIGEST =
  deriveSubstrateGrandpaV1AuthenticatedSettlementPayoutDigest({
    candidateId: CANDIDATE_ID,
    burnId: BURN_ID,
    sidechainId: SIDECHAIN_ID,
    burnTxHash: BURN_TX_HASH,
    sidechainHeight: CANDIDATE.sidechainHeight,
    executionBlockHash: EXECUTION_BLOCK_HASH,
    eventIndex: CANDIDATE.sidechainLogIndex,
    amountNanoErg: AMOUNT_NANOERG,
    recipientErgoTreeHex: RECIPIENT_ERGO_TREE,
    vaultBoxId: VAULT_BOX_ID,
  });

const PERSISTED_RESERVATION: AuthenticatedSettlementExecutionReservation =
  Object.freeze({
    schema: 'e2s.authenticated-settlement-execution-reservation.v2',
    reservationDigestHex: RESERVATION_DIGEST,
    candidateId: CANDIDATE_ID,
    candidateAuthorityDigestHex:
      deriveAuthenticatedSettlementCandidateAuthorityDigest(CANDIDATE),
    burnId: BURN_ID,
    burnTxHash: BURN_TX_HASH,
    amountNanoErg: AMOUNT_NANOERG,
    recipientErgoTreeHex: RECIPIENT_ERGO_TREE,
    duplicatePreventionBoxId: DUP_BOX_ID,
    vaultBoxId: VAULT_BOX_ID,
    expectedTxId: EXPECTED_TX_ID,
    unsignedTxDigestHex: UNSIGNED_TX_DIGEST,
    unsignedPackageDigestHex: PACKAGE_DIGEST,
    signedTransactionDigestHex: SIGNED_TX_DIGEST,
    checkResponseDigestHex: CHECK_RESPONSE_DIGEST,
    signerContextDigestHex: SIGNER_CONTEXT_DIGEST,
    checkerIdentityDigestHex: CHECKER_IDENTITY_DIGEST,
    revalidationDigestHex: REVALIDATION_DIGEST,
    stableErgoViewDigestHex: ERGO_VIEW_DIGEST,
    stableSidechainViewDigestHex: SIDECHAIN_VIEW_DIGEST,
    finalityProofDigestHex: FINALITY_PROOF_DIGEST,
    checkAdmissionDigestHex: ADMISSION_DIGEST,
    authorizationDigestHex: AUTHORIZATION_DIGEST,
    status: 'active',
    revocationReason: null,
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
  });

const PEG_OUT = Object.freeze({
  sidechainTxHash: BURN_TX_HASH,
  ergoRecipientAddress: RECIPIENT_ERGO_TREE,
  amountNanoErg: AMOUNT_NANOERG,
  amount: AMOUNT_NANOERG,
  user: `0x${'31'.repeat(20)}`,
  sidechainId: SIDECHAIN_ID,
  sidechainBurnHeight: CANDIDATE.sidechainHeight,
  sidechainBlockNumber: Number(CANDIDATE.sidechainHeight),
  sidechainBlockHash: EXECUTION_BLOCK_HASH,
  sidechainLogIndex: CANDIDATE.sidechainLogIndex,
  burnId: BURN_ID,
  sidechainBurnTxHash: BURN_TX_HASH,
  status: 'confirmed',
});

interface SignedArtifact {
  readonly candidateId: string;
  readonly expectedTxId: string;
  readonly unsignedTxDigestHex: string;
  readonly unsignedPackageDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly signerContextDigestHex: string;
  readonly nodeOrigin: string;
  readonly signed: Readonly<{ handle: string }>;
}

const SIGNED_ARTIFACT: SignedArtifact = Object.freeze({
  candidateId: CANDIDATE_ID,
  expectedTxId: EXPECTED_TX_ID,
  unsignedTxDigestHex: UNSIGNED_TX_DIGEST,
  unsignedPackageDigestHex: PACKAGE_DIGEST,
  signedTransactionDigestHex: SIGNED_TX_DIGEST,
  signerContextDigestHex: SIGNER_CONTEXT_DIGEST,
  nodeOrigin: 'http://127.0.0.1:9052',
  signed: Object.freeze({ handle: 'opaque-signed-material' }),
});

type Candidate = AuthenticatedSettlementCandidate;
type Prepared = Readonly<{ marker: 'prepared' }>;
const PREPARED: Prepared = Object.freeze({ marker: 'prepared' });

function coreBinding() {
  return {
    candidate: CANDIDATE,
    candidateId: CANDIDATE_ID,
    expectedTxId: EXPECTED_TX_ID,
    unsignedTxDigestHex: UNSIGNED_TX_DIGEST,
    unsignedPackageDigestHex: PACKAGE_DIGEST,
    payoutDigestHex: PAYOUT_DIGEST,
    trackerBoxId: TRACKER_BOX_ID,
    duplicatePreventionBoxId: DUP_BOX_ID,
  };
}

function checkedDigests() {
  return {
    revalidationDigestHex: REVALIDATION_DIGEST,
    packageBindingDigestHex: PACKAGE_BINDING_DIGEST,
    signedTransactionDigestHex: SIGNED_TX_DIGEST,
    signerContextDigestHex: SIGNER_CONTEXT_DIGEST,
    checkResponseDigestHex: CHECK_RESPONSE_DIGEST,
    checkerIdentityDigestHex: CHECKER_IDENTITY_DIGEST,
  };
}

async function makeReservedHandoff() {
  const input: AuthenticatedSettlementLifecycleInput<Candidate> = {
    candidate: CANDIDATE,
    candidateId: CANDIDATE_ID,
    unsignedTxDigestHex: UNSIGNED_TX_DIGEST,
    unsignedPackageDigestHex: PACKAGE_DIGEST,
    payoutDigestHex: PAYOUT_DIGEST,
    trackerBoxId: TRACKER_BOX_ID,
    duplicatePreventionBoxId: DUP_BOX_ID,
  };
  const admissionDigests = {
    ...checkedDigests(),
    stableErgoViewDigestHex: ERGO_VIEW_DIGEST,
    stableSidechainViewDigestHex: SIDECHAIN_VIEW_DIGEST,
    admissionDigestHex: ADMISSION_DIGEST,
  };
  const reservationDigests = {
    ...admissionDigests,
    authorizationDigestHex: AUTHORIZATION_DIGEST,
    reservationDigestHex: RESERVATION_DIGEST,
  };
  const ports: AuthenticatedSettlementCheckReservationPorts<
    Candidate,
    Prepared,
    SignedArtifact
  > = {
    revalidation: {
      revalidate: async exactInput => ({
        ...coreBinding(),
        input: exactInput,
        prepared: PREPARED,
        revalidationDigestHex: REVALIDATION_DIGEST,
      }),
    },
    packageBinding: {
      bind: async revalidation => ({
        ...coreBinding(),
        revalidation,
        prepared: PREPARED,
        revalidationDigestHex: REVALIDATION_DIGEST,
        packageBindingDigestHex: PACKAGE_BINDING_DIGEST,
      }),
    },
    signer: {
      sign: async packageBinding => ({
        ...coreBinding(),
        packageBinding,
        revalidationDigestHex: REVALIDATION_DIGEST,
        packageBindingDigestHex: PACKAGE_BINDING_DIGEST,
        signedTransactionDigestHex: SIGNED_TX_DIGEST,
        signerContextDigestHex: SIGNER_CONTEXT_DIGEST,
        signedArtifact: SIGNED_ARTIFACT,
      }),
    },
    checker: {
      check: async signed => ({
        ...coreBinding(),
        signed,
        ...checkedDigests(),
      }),
    },
    stableErgoObservation: {
      observe: async check => ({
        ...coreBinding(),
        check,
        ...checkedDigests(),
        viewDigestHex: ERGO_VIEW_DIGEST,
      }),
    },
    stableSidechainObservation: {
      observe: async check => ({
        ...coreBinding(),
        check,
        ...checkedDigests(),
        viewDigestHex: SIDECHAIN_VIEW_DIGEST,
      }),
    },
    checkAdmission: {
      authorize: ({ check, stableErgoView, stableSidechainView }) => ({
        ...coreBinding(),
        check,
        stableErgoView,
        stableSidechainView,
        ...admissionDigests,
      }),
    },
    checkJournal: {
      record: admission => ({
        ...coreBinding(),
        admission,
        ...admissionDigests,
        applied: true,
        status: 'check_passed',
      }),
    },
    executionAuthorization: {
      authorize: ({ checkAdmission, checkJournal }) => ({
        ...coreBinding(),
        checkAdmission,
        checkJournal,
        ...admissionDigests,
        authorizationDigestHex: AUTHORIZATION_DIGEST,
      }),
    },
    reservationAdmission: {
      authorize: authorization => ({
        ...coreBinding(),
        authorization,
        ...reservationDigests,
      }),
    },
    executionReservationJournal: {
      reserve: admission => ({
        ...coreBinding(),
        admission,
        ...reservationDigests,
        applied: true,
        status: 'active',
      }),
    },
  };
  return prepareAuthenticatedSettlementExecutionReservation(input, ports);
}

function observationSources(options: {
  primaryMempool?: boolean;
  witnessMempool?: boolean;
} = {}) {
  const client = (mempool: boolean): AggregateSettlementErgoObservationClient => ({
    getCurrentHeight: vi.fn(async () => 120),
    getBlockHeaderHash: vi.fn(async () => hex('41')),
    getTransaction: vi.fn(async () => null),
    hasUnconfirmedTransaction: vi.fn(async () => mempool),
  });
  return createMatchingAggregateSettlementErgoObservationSources({
    primaryErgo: client(options.primaryMempool ?? true),
    primaryNodeUrl: 'http://127.0.0.1:9052',
    primaryNodeIdentityDigestHex: hex('42'),
    primaryAdministrationIdentityDigestHex: hex('43'),
    witnessErgo: client(options.witnessMempool ?? true),
    witnessNodeUrl: 'http://127.0.0.1:9152',
    witnessNodeIdentityDigestHex: hex('44'),
    witnessAdministrationIdentityDigestHex: hex('45'),
  });
}

function durableAttempt(input: {
  transportReservationDigestHex: string;
  durableAttemptDigestHex: string;
}): AuthenticatedSettlementSubmissionAttempt {
  return {
    schema: 'e2s.authenticated-settlement-transport-attempt.v1',
    lifecycleVersion: 1,
    executionReservationDigestHex: RESERVATION_DIGEST,
    transportReservationDigestHex: input.transportReservationDigestHex,
    durableAttemptDigestHex: input.durableAttemptDigestHex,
    candidateId: CANDIDATE_ID,
    expectedTxId: EXPECTED_TX_ID,
    unsignedTxDigestHex: UNSIGNED_TX_DIGEST,
    unsignedPackageDigestHex: PACKAGE_DIGEST,
    payoutDigestHex: PAYOUT_DIGEST,
    trackerBoxId: TRACKER_BOX_ID,
    duplicatePreventionBoxId: DUP_BOX_ID,
    signedTransactionDigestHex: SIGNED_TX_DIGEST,
    preSubmitRevalidationDigestHex: hex('46'),
    broadcastAuthorizationDigestHex: hex('47'),
    status: 'pending',
    submissionAttempted: true,
    submissionDisposition: null,
    submittedTxId: null,
    responseDigestHex: null,
    ergoObservation: null,
    ergoObservationSourceCount: 0,
    ergoObservationConsensusDigestHex: null,
    quarantineReason: null,
    createdAt: '2026-07-29T00:00:00.000Z',
    submissionFinalizedAt: null,
    confirmedAt: null,
    updatedAt: '2026-07-29T00:00:00.000Z',
  };
}

function stateFixture(events: string[]) {
  let attempt: AuthenticatedSettlementSubmissionAttempt | null = null;
  const state = {
    getAuthenticatedSettlementCandidate: vi.fn(() => CANDIDATE),
    getAuthenticatedSettlementExecutionReservation:
      vi.fn(() => PERSISTED_RESERVATION),
    getPegOutByBurnId: vi.fn(() => PEG_OUT),
    getAuthenticatedSettlementSubmissionAttempt: vi.fn(() => attempt),
    reserveAuthenticatedSettlementTransportAttempt: vi.fn(admission => {
      events.push('journal-transport');
      attempt = {
        ...durableAttempt(admission),
        preSubmitRevalidationDigestHex:
          admission.preSubmitRevalidationDigestHex,
        broadcastAuthorizationDigestHex:
          admission.broadcastAuthorizationDigestHex,
      };
      return attempt;
    }),
    finalizeAuthenticatedSettlementSubmissionAttempt: vi.fn(input => {
      events.push('journal-submission');
      if (!attempt) throw new Error('attempt unavailable');
      const status = input.disposition === 'accepted'
        ? 'submitted'
        : input.disposition === 'rejected'
          ? 'rejected'
          : 'pending';
      attempt = {
        ...attempt,
        status,
        submissionDisposition: input.disposition,
        submittedTxId: input.submittedTxId,
        responseDigestHex: input.responseDigestHex,
        submissionFinalizedAt: '2026-07-29T00:00:01.000Z',
      };
      return attempt;
    }),
    recordAuthenticatedSettlementSubmissionObservation: vi.fn(input => {
      events.push('journal-observation');
      if (!attempt) throw new Error('attempt unavailable');
      const observedStatus = input.observation.record.status;
      const confirmedDisappeared =
        attempt.status === 'confirmed'
        && observedStatus !== 'confirmed_final';
      const resultStatus = confirmedDisappeared
        ? 'quarantined'
        : observedStatus === 'confirmed_final'
          ? 'confirmed'
          : observedStatus === 'mempool'
            || observedStatus === 'confirmed_pre_finality'
            ? 'submitted'
            : 'pending_reconciliation';
      const persistedStatus =
        resultStatus === 'pending_reconciliation'
          ? attempt.status
          : resultStatus;
      attempt = {
        ...attempt,
        status: persistedStatus,
        submissionDisposition:
          resultStatus === 'pending_reconciliation'
            ? attempt.submissionDisposition
            : 'accepted',
        submittedTxId:
          resultStatus === 'pending_reconciliation'
            ? attempt.submittedTxId
            : EXPECTED_TX_ID,
        ergoObservation: input.observation.record,
        ergoObservationSourceCount: input.consensus.sourceCount,
        ergoObservationConsensusDigestHex:
          input.consensus.consensusDigestHex,
        quarantineReason: confirmedDisappeared
          ? 'confirmed_transaction_disappeared'
          : null,
      };
      return {
        applied: true,
        status: resultStatus,
        attempt,
      };
    }),
    getObservableAuthenticatedSettlementSubmissionAttempts: vi.fn(() =>
      attempt ? [attempt] : []
    ),
  };
  return {
    state: state as unknown as Pick<
      StateTracker,
      | 'getAuthenticatedSettlementCandidate'
      | 'getAuthenticatedSettlementExecutionReservation'
      | 'getPegOutByBurnId'
      | 'getAuthenticatedSettlementSubmissionAttempt'
      | 'reserveAuthenticatedSettlementTransportAttempt'
      | 'finalizeAuthenticatedSettlementSubmissionAttempt'
      | 'recordAuthenticatedSettlementSubmissionObservation'
      | 'getObservableAuthenticatedSettlementSubmissionAttempts'
    >,
    setAttempt(value: AuthenticatedSettlementSubmissionAttempt): void {
      attempt = value;
    },
    getAttempt(): AuthenticatedSettlementSubmissionAttempt | null {
      return attempt;
    },
    mocks: state,
  };
}

function registeredExecutionDeps(
  fixture: ReturnType<typeof stateFixture>,
  events: string[],
  submitter: AuthenticatedSettlementFixedSubmitter,
  sources = observationSources(),
) {
  return createAuthenticatedSettlementReservedExecutionCompatibilityDeps({
    state: fixture.state,
    confirmationSources: sources,
    submitter,
    revalidateImmediately: vi.fn(async () => {
      events.push('revalidate-immediate');
      return {
        currentErgoViewDigestHex: CURRENT_ERGO_VIEW_DIGEST,
        currentSidechainViewDigestHex: CURRENT_SIDECHAIN_VIEW_DIGEST,
      };
    }),
    authorizeBroadcast: vi.fn(() => {
      events.push('authorize-broadcast');
      return { approvalDigestHex: APPROVAL_DIGEST };
    }),
    assertBroadcastApprovalCurrent: vi.fn(async input => {
      events.push('recheck-broadcast');
      expect(input).not.toHaveProperty('authorization');
      expect(input.broadcastAuthorizationDigestHex).toMatch(/^[0-9a-f]{64}$/);
    }),
  });
}

function executionDeps(
  fixture: ReturnType<typeof stateFixture>,
  events: string[],
  submit: (
    input: Parameters<AuthenticatedSettlementFixedSubmitter['submit']>[0],
  ) => Promise<AuthenticatedSettlementFixedSubmissionResult | null>,
  sources = observationSources(),
) {
  return registeredExecutionDeps(
    fixture,
    events,
    createAuthenticatedSettlementFixedSubmitter({ submit }),
    sources,
  );
}

describe('authenticated settlement reserved-execution compatibility', () => {
  it('journals the exact attempt before invoking the fixed opaque submitter', async () => {
    const events: string[] = [];
    const fixture = stateFixture(events);
    let submitInput: unknown;
    const deps = executionDeps(
      fixture,
      events,
      async input => {
        events.push('submit');
        submitInput = input;
        return {
          status: 'accepted',
          submittedTxId: EXPECTED_TX_ID,
          responseDigestHex: RESPONSE_DIGEST,
        };
      },
    );

    const result =
      await runAuthenticatedSettlementReservedExecutionCompatibility(
        await makeReservedHandoff() as never,
        deps as never,
      );

    expect(result.status).toBe('submitted');
    expect(events).toEqual([
      'revalidate-immediate',
      'authorize-broadcast',
      'journal-transport',
      'recheck-broadcast',
      'submit',
      'journal-submission',
      'journal-observation',
    ]);
    expect(submitInput).toEqual(expect.objectContaining({
      signedArtifact: SIGNED_ARTIFACT,
      authorization: expect.objectContaining({
        expectedTxId: EXPECTED_TX_ID,
        signedTransactionDigestHex: SIGNED_TX_DIGEST,
      }),
    }));
    expect(Object.isFrozen(submitInput)).toBe(true);
    expect(JSON.stringify(submitInput)).not.toContain('"signedTx":');
    expect(JSON.stringify(submitInput)).not.toContain('"proofs":');
    expect(fixture.getAttempt()).toEqual(expect.objectContaining({
      status: 'submitted',
      submittedTxId: EXPECTED_TX_ID,
      submissionDisposition: 'accepted',
    }));
    await expect(
      deps.submitter.submit(
        submitInput as Parameters<AuthenticatedSettlementFixedSubmitter['submit']>[0],
      ),
    ).rejects.toThrow(/already been consumed/);
  });

  it('pins the registered transport function and rejects cloned capability roots', async () => {
    const events: string[] = [];
    const fixture = stateFixture(events);
    const originalTransport = vi.fn(async () => {
      events.push('submit-original');
      return {
        status: 'accepted' as const,
        submittedTxId: EXPECTED_TX_ID,
        responseDigestHex: RESPONSE_DIGEST,
      };
    });
    const replacementTransport = vi.fn(async () => {
      events.push('submit-replacement');
      return null;
    });
    const transport: {
      submit: Parameters<typeof createAuthenticatedSettlementFixedSubmitter>[0]['submit'];
    } = {
      submit: originalTransport,
    };
    const submitter = createAuthenticatedSettlementFixedSubmitter(transport);
    transport.submit = replacementTransport;
    const deps = registeredExecutionDeps(
      fixture,
      events,
      submitter,
    );

    const result =
      await runAuthenticatedSettlementReservedExecutionCompatibility(
        await makeReservedHandoff() as never,
        deps as never,
      );

    expect(result.status).toBe('submitted');
    expect(originalTransport).toHaveBeenCalledOnce();
    expect(replacementTransport).not.toHaveBeenCalled();
    await expect(
      runAuthenticatedSettlementReservedExecutionCompatibility(
        await makeReservedHandoff() as never,
        { ...deps } as never,
      ),
    ).rejects.toThrow(/not process registered/);
    expect(() =>
      createAuthenticatedSettlementReservedExecutionCompatibilityDeps({
        ...deps,
        submitter: Object.freeze({ ...submitter }),
      } as never)
    ).toThrow(/submitter provenance/);
  });

  it('persists an explicit ambiguity but leaves a thrown transport pending and unfinalized', async () => {
    const ambiguousEvents: string[] = [];
    const ambiguousFixture = stateFixture(ambiguousEvents);
    const ambiguous = executionDeps(
      ambiguousFixture,
      ambiguousEvents,
      async () => {
        ambiguousEvents.push('submit');
        return null;
      },
    );
    const ambiguousResult =
      await runAuthenticatedSettlementReservedExecutionCompatibility(
        await makeReservedHandoff() as never,
        ambiguous as never,
      );
    expect(ambiguousResult.status).toBe('pending_reconciliation');
    expect(ambiguousFixture.getAttempt()).toEqual(expect.objectContaining({
      status: 'pending',
      submissionDisposition: 'ambiguous',
    }));
    expect(ambiguousFixture.mocks.recordAuthenticatedSettlementSubmissionObservation)
      .not.toHaveBeenCalled();

    const thrownEvents: string[] = [];
    const thrownFixture = stateFixture(thrownEvents);
    const thrown = executionDeps(
      thrownFixture,
      thrownEvents,
      async () => {
        thrownEvents.push('submit');
        throw new Error('transport interrupted');
      },
    );
    await expect(
      runAuthenticatedSettlementReservedExecutionCompatibility(
        await makeReservedHandoff() as never,
        thrown as never,
      ),
    ).rejects.toThrow('transport interrupted');
    expect(thrownFixture.getAttempt()).toEqual(expect.objectContaining({
      status: 'pending',
      submissionDisposition: null,
    }));
    expect(thrownFixture.mocks.finalizeAuthenticatedSettlementSubmissionAttempt)
      .not.toHaveBeenCalled();
  });

  it('reconciles a durable crash record by observation without a submit capability', async () => {
    const events: string[] = [];
    const fixture = stateFixture(events);
    fixture.setAttempt(durableAttempt({
      transportReservationDigestHex: hex('51'),
      durableAttemptDigestHex: hex('52'),
    }));

    const results =
      await reconcileRecoverableAuthenticatedSettlementSubmissionsCompatibility(
        createAuthenticatedSettlementRestartCompatibilityDeps({
          state: fixture.state,
          confirmationSources: observationSources(),
        }),
      );

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(expect.objectContaining({
      status: 'reconciled',
      failureCode: null,
      result: expect.objectContaining({ status: 'submitted' }),
    }));
    expect(events).toEqual(['journal-observation']);
    expect(fixture.mocks.reserveAuthenticatedSettlementTransportAttempt)
      .not.toHaveBeenCalled();
    expect(fixture.mocks.finalizeAuthenticatedSettlementSubmissionAttempt)
      .not.toHaveBeenCalled();
  });

  it('isolates one failed restart reconciliation and continues with later attempts', async () => {
    const events: string[] = [];
    const fixture = stateFixture(events);
    const first = durableAttempt({
      transportReservationDigestHex: hex('53'),
      durableAttemptDigestHex: hex('54'),
    });
    const second = durableAttempt({
      transportReservationDigestHex: hex('55'),
      durableAttemptDigestHex: hex('56'),
    });
    const record =
      vi.fn((
        input: Parameters<
          StateTracker['recordAuthenticatedSettlementSubmissionObservation']
        >[0],
      ): AuthenticatedSettlementSubmissionObservationResult => {
        if (input.durableAttemptDigestHex === first.durableAttemptDigestHex) {
          throw new Error('first observation journal is unavailable');
        }
        return {
          applied: true,
          status: 'submitted',
          attempt: second,
        };
      });
    const state = {
      ...fixture.state,
      getObservableAuthenticatedSettlementSubmissionAttempts:
        vi.fn(() => [first, second]),
      recordAuthenticatedSettlementSubmissionObservation: record,
    };

    const results =
      await reconcileRecoverableAuthenticatedSettlementSubmissionsCompatibility(
        createAuthenticatedSettlementRestartCompatibilityDeps({
          state,
          confirmationSources: observationSources(),
        }),
      );

    expect(results).toEqual([
      {
        durableAttemptDigestHex: first.durableAttemptDigestHex,
        status: 'failed',
        result: null,
        failureCode: 'reconciliation_failed',
      },
      expect.objectContaining({
        durableAttemptDigestHex: second.durableAttemptDigestHex,
        status: 'reconciled',
        failureCode: null,
        result: expect.objectContaining({ status: 'submitted' }),
      }),
    ]);
    expect(record).toHaveBeenCalledTimes(2);
  });

  it('returns fail-closed when restart races with a terminal quarantine', async () => {
    const events: string[] = [];
    const fixture = stateFixture(events);
    const pending = durableAttempt({
      transportReservationDigestHex: hex('57'),
      durableAttemptDigestHex: hex('58'),
    });
    fixture.setAttempt(pending);
    vi.mocked(
      fixture.mocks.recordAuthenticatedSettlementSubmissionObservation,
    ).mockImplementationOnce(() => {
      fixture.setAttempt({
        ...pending,
        status: 'quarantined',
        quarantineReason: 'execution_reservation_revoked',
      });
      throw new Error('attempt became quarantined before observation journal');
    });

    const outcomes =
      await reconcileRecoverableAuthenticatedSettlementSubmissionsCompatibility(
        createAuthenticatedSettlementRestartCompatibilityDeps({
          state: fixture.state,
          confirmationSources: observationSources(),
        }),
      );

    expect(outcomes).toEqual([
      expect.objectContaining({
        durableAttemptDigestHex: pending.durableAttemptDigestHex,
        status: 'reconciled',
        failureCode: null,
        result: expect.objectContaining({
          status: 'fail_closed',
          journal: expect.objectContaining({
            applied: false,
            terminalStateRetained: true,
            status: 'quarantined',
          }),
        }),
      }),
    ]);
  });

  it('awaits approval freshness and never starts transport after an asynchronous rejection', async () => {
    const events: string[] = [];
    const fixture = stateFixture(events);
    const deps = executionDeps(
      fixture,
      events,
      async () => {
        events.push('submit');
        return {
          status: 'accepted',
          submittedTxId: EXPECTED_TX_ID,
          responseDigestHex: RESPONSE_DIGEST,
        };
      },
    );
    vi.mocked(deps.assertBroadcastApprovalCurrent).mockImplementationOnce(
      async () => {
        events.push('recheck-broadcast');
        await Promise.resolve();
        throw new Error('broadcast approval expired');
      },
    );

    await expect(
      runAuthenticatedSettlementReservedExecutionCompatibility(
        await makeReservedHandoff() as never,
        deps as never,
      ),
    ).rejects.toThrow('broadcast approval expired');
    expect(events).toEqual([
      'revalidate-immediate',
      'authorize-broadcast',
      'journal-transport',
      'recheck-broadcast',
    ]);
    expect(fixture.getAttempt()).toEqual(expect.objectContaining({
      status: 'pending',
      submissionDisposition: null,
    }));
  });

  it('journals a certain rejection and rejects a returned transaction outside the authorization', async () => {
    const rejectedEvents: string[] = [];
    const rejectedFixture = stateFixture(rejectedEvents);
    const rejectedDeps = executionDeps(
      rejectedFixture,
      rejectedEvents,
      async () => {
        rejectedEvents.push('submit');
        return {
          status: 'rejected',
          submittedTxId: null,
          responseDigestHex: RESPONSE_DIGEST,
        };
      },
    );
    const rejected =
      await runAuthenticatedSettlementReservedExecutionCompatibility(
        await makeReservedHandoff() as never,
        rejectedDeps as never,
      );
    expect(rejected.status).toBe('fail_closed');
    expect(rejectedFixture.getAttempt()).toEqual(expect.objectContaining({
      status: 'rejected',
      submissionDisposition: 'rejected',
    }));
    expect(rejectedFixture.mocks.recordAuthenticatedSettlementSubmissionObservation)
      .not.toHaveBeenCalled();

    const wrongEvents: string[] = [];
    const wrongFixture = stateFixture(wrongEvents);
    const wrongDeps = executionDeps(
      wrongFixture,
      wrongEvents,
      async () => {
        wrongEvents.push('submit');
        return {
          status: 'accepted',
          submittedTxId: hex('61'),
          responseDigestHex: RESPONSE_DIGEST,
        };
      },
    );
    await expect(
      runAuthenticatedSettlementReservedExecutionCompatibility(
        await makeReservedHandoff() as never,
        wrongDeps as never,
      ),
    ).rejects.toThrow(/outside the authorization/i);
    expect(wrongFixture.getAttempt()).toEqual(expect.objectContaining({
      status: 'pending',
      submissionDisposition: null,
    }));
  });

  it('continues monitoring a confirmed attempt and returns fail-closed after disappearance', async () => {
    const events: string[] = [];
    const fixture = stateFixture(events);
    const confirmed = {
      ...durableAttempt({
        transportReservationDigestHex: hex('62'),
        durableAttemptDigestHex: hex('63'),
      }),
      status: 'confirmed',
      submissionDisposition: 'accepted',
      submittedTxId: EXPECTED_TX_ID,
      responseDigestHex: RESPONSE_DIGEST,
      ergoObservation: {
        policyVersion: 1,
        requiredConfirmations: 10,
        status: 'confirmed_final',
        transactionIdHex: EXPECTED_TX_ID,
        transactionDigestHex: hex('64'),
        inclusionHeight: 100,
        inclusionHeaderIdHex: hex('65'),
        observedTipHeight: 109,
        observedTipHeaderIdHex: hex('66'),
        confirmations: 10,
        observationDigestHex: hex('67'),
      },
      ergoObservationSourceCount: 2,
      ergoObservationConsensusDigestHex: hex('68'),
      confirmedAt: '2026-07-29T00:01:00.000Z',
    } satisfies AuthenticatedSettlementSubmissionAttempt;
    fixture.setAttempt(confirmed);

    const outcomes =
      await reconcileRecoverableAuthenticatedSettlementSubmissionsCompatibility(
        createAuthenticatedSettlementRestartCompatibilityDeps({
          state: fixture.state,
          confirmationSources: observationSources({
            primaryMempool: false,
            witnessMempool: false,
          }),
        }),
      );

    expect(outcomes).toEqual([
      expect.objectContaining({
        status: 'reconciled',
        result: expect.objectContaining({ status: 'fail_closed' }),
      }),
    ]);
    expect(fixture.getAttempt()).toEqual(expect.objectContaining({
      status: 'quarantined',
      quarantineReason: 'confirmed_transaction_disappeared',
    }));
  });

  it('fails before transport reservation when immediate revalidation fails', async () => {
    const events: string[] = [];
    const fixture = stateFixture(events);
    const deps = executionDeps(
      fixture,
      events,
      async () => {
        events.push('submit');
        return {
          status: 'accepted',
          submittedTxId: EXPECTED_TX_ID,
          responseDigestHex: RESPONSE_DIGEST,
        };
      },
    );
    vi.mocked(deps.revalidateImmediately).mockRejectedValueOnce(
      new Error('current chain view unavailable'),
    );

    await expect(
      runAuthenticatedSettlementReservedExecutionCompatibility(
        await makeReservedHandoff() as never,
        deps as never,
      ),
    ).rejects.toThrow('current chain view unavailable');
    expect(fixture.mocks.reserveAuthenticatedSettlementTransportAttempt)
      .not.toHaveBeenCalled();
    expect(events).not.toContain('submit');
  });

  it('leaves the accepted attempt submitted when the bounded Ergo sources disagree', async () => {
    const events: string[] = [];
    const fixture = stateFixture(events);
    const deps = executionDeps(
      fixture,
      events,
      async () => {
        events.push('submit');
        return {
          status: 'accepted',
          submittedTxId: EXPECTED_TX_ID,
          responseDigestHex: RESPONSE_DIGEST,
        };
      },
      observationSources({
        primaryMempool: true,
        witnessMempool: false,
      }),
    );

    await expect(
      runAuthenticatedSettlementReservedExecutionCompatibility(
        await makeReservedHandoff() as never,
        deps as never,
      ),
    ).rejects.toThrow(/sources disagree/i);
    expect(fixture.getAttempt()).toEqual(expect.objectContaining({
      status: 'submitted',
      submissionDisposition: 'accepted',
    }));
    expect(fixture.mocks.recordAuthenticatedSettlementSubmissionObservation)
      .not.toHaveBeenCalled();
  });
});
