import {
  reconcileAuthenticatedSettlementSubmissionAttempt,
  runAuthenticatedSettlementReservedExecution,
} from './apps/bridge-daemon/authenticated-settlement-reserved-execution.js';
import {
  observeMatchingAggregateSettlementErgoTransaction,
  type AggregateSettlementErgoObservationSourcePair,
  type MatchingAggregateSettlementErgoObservationResult,
} from './adapters/aggregate-settlement-ergo-observation.js';
import type {
  AggregateSettlementErgoFinalityPolicyV1,
  AggregateSettlementErgoObservationRecord,
  AggregateSettlementErgoObservationStatus,
} from './adapters/aggregate-settlement-ergo-finality-policy.js';
import {
  assertAuthenticatedSettlementSignedCheckCandidateProvenance,
  type AuthenticatedSettlementSignedCheckCandidate,
  type RevalidatedAuthenticatedSettlementCandidate,
} from './authenticated-settlement-jvm-check.js';
import {
  assertAuthenticatedSettlementTransportAttemptAdmissionProvenance,
  assertAuthenticatedSettlementTransportAttemptCurrentAuthority,
  authorizeAuthenticatedSettlementTransportAttempt,
} from './authenticated-settlement-transport-attempt.js';
import {
  assertAuthenticatedSettlementReservedHandoffProvenance,
  type AuthenticatedSettlementBroadcastAuthorization,
  type AuthenticatedSettlementConfirmationJournalResult,
  type AuthenticatedSettlementConfirmationObservation,
  type AuthenticatedSettlementConfirmationObservationStatus,
  type AuthenticatedSettlementDurableSubmissionIdentity,
  type AuthenticatedSettlementImmediateRevalidation,
  type AuthenticatedSettlementLifecycleBinding,
  type AuthenticatedSettlementLifecycleHandoff,
  type AuthenticatedSettlementReservedHandoff,
  type AuthenticatedSettlementRestartJournalResult,
  type AuthenticatedSettlementRestartObservation,
  type AuthenticatedSettlementRestartReconciliationResult,
  type AuthenticatedSettlementSubmissionFinalization,
  type AuthenticatedSettlementSubmitRequest,
  type AuthenticatedSettlementSubmitResult,
  type AuthenticatedSettlementTransportReservation,
} from './relayer-core/authenticated-settlement-execution-lifecycle.js';
import { sha256CanonicalJson } from './strict-json.js';
import type {
  AuthenticatedSettlementCandidate,
  AuthenticatedSettlementSubmissionAttempt,
  AuthenticatedSettlementSubmissionObservationResult,
  StateTracker,
} from './state-tracker.js';

const PRE_SUBMIT_REVALIDATION_DIGEST_DOMAIN =
  'E2S_AUTHENTICATED_SETTLEMENT_PRE_SUBMIT_REVALIDATION_V1';
const BROADCAST_AUTHORIZATION_DIGEST_DOMAIN =
  'E2S_AUTHENTICATED_SETTLEMENT_BROADCAST_AUTHORIZATION_V1';
const CONFIRMATION_OBSERVATION_DIGEST_DOMAIN =
  'E2S_AUTHENTICATED_SETTLEMENT_CONFIRMATION_OBSERVATION_V1';
const OPAQUE_BROADCAST_AUTHORIZATION_PROFILE =
  'e2s.authenticated-settlement-broadcast-authorization.v1' as const;
const FIXED_SUBMITTER_PROFILE =
  'e2s.authenticated-settlement-fixed-submitter.v1' as const;

type Candidate = AuthenticatedSettlementCandidate;
type Prepared = RevalidatedAuthenticatedSettlementCandidate['prepared'];
type SignedArtifact = AuthenticatedSettlementSignedCheckCandidate;
type ReservedHandoff = AuthenticatedSettlementReservedHandoff<
  Candidate,
  Prepared,
  SignedArtifact
>;
type LifecycleHandoff = AuthenticatedSettlementLifecycleHandoff<
  Candidate,
  Prepared,
  SignedArtifact
>;
type CoreImmediateRevalidation = AuthenticatedSettlementImmediateRevalidation<
  Candidate,
  Prepared,
  SignedArtifact
>;
type CoreBroadcastAuthorization =
  AuthenticatedSettlementBroadcastAuthorization<
    Candidate,
    Prepared,
    SignedArtifact
  >;
type CoreTransportReservation = AuthenticatedSettlementTransportReservation<
  Candidate,
  Prepared,
  SignedArtifact
>;
type CoreSubmitRequest = AuthenticatedSettlementSubmitRequest<
  Candidate,
  Prepared,
  SignedArtifact
>;
type CoreSubmitResult = AuthenticatedSettlementSubmitResult<
  Candidate,
  Prepared,
  SignedArtifact
>;
type CoreSubmissionFinalization =
  AuthenticatedSettlementSubmissionFinalization<
    Candidate,
    Prepared,
    SignedArtifact
  >;
type CoreConfirmationObservation =
  AuthenticatedSettlementConfirmationObservation<
    Candidate,
    Prepared,
    SignedArtifact
  >;
type CoreConfirmationJournalResult =
  AuthenticatedSettlementConfirmationJournalResult<
    Candidate,
    Prepared,
    SignedArtifact
  >;

type AuthenticatedSettlementReservedExecutionState = Pick<
  StateTracker,
  | 'getAuthenticatedSettlementCandidate'
  | 'getAuthenticatedSettlementExecutionReservation'
  | 'getPegOutByBurnId'
  | 'getAuthenticatedSettlementSubmissionAttempt'
  | 'reserveAuthenticatedSettlementTransportAttempt'
  | 'finalizeAuthenticatedSettlementSubmissionAttempt'
  | 'recordAuthenticatedSettlementSubmissionObservation'
  | 'getObservableAuthenticatedSettlementSubmissionAttempts'
>;

export interface AuthenticatedSettlementImmediateRevalidationEvidence {
  readonly currentErgoViewDigestHex: string;
  readonly currentSidechainViewDigestHex: string;
}

export interface AuthenticatedSettlementBroadcastApproval {
  readonly approvalDigestHex: string;
}

export interface AuthenticatedSettlementOpaqueBroadcastAuthorization {
  readonly profile: typeof OPAQUE_BROADCAST_AUTHORIZATION_PROFILE;
  readonly candidateId: string;
  readonly expectedTxId: string;
  readonly signedTransactionDigestHex: string;
  readonly preSubmitRevalidationDigestHex: string;
  readonly approvalDigestHex: string;
  readonly broadcastAuthorizationDigestHex: string;
}

export type AuthenticatedSettlementFixedSubmissionResult =
  | Readonly<{
      status: 'accepted';
      submittedTxId: string;
      responseDigestHex: string;
    }>
  | Readonly<{
      status: 'rejected';
      submittedTxId: null;
      responseDigestHex: string;
    }>
  | Readonly<{
      status: 'ambiguous';
      submittedTxId: null;
      responseDigestHex: string | null;
    }>;

export interface AuthenticatedSettlementFixedSubmitter {
  readonly profile: typeof FIXED_SUBMITTER_PROFILE;
  submit(input: Readonly<{
    signedArtifact: SignedArtifact;
    authorization: AuthenticatedSettlementOpaqueBroadcastAuthorization;
  }>): Promise<AuthenticatedSettlementFixedSubmissionResult | null>;
}

export interface AuthenticatedSettlementReservedExecutionCompatibilityDeps {
  readonly state: AuthenticatedSettlementReservedExecutionState;
  readonly confirmationSources: AggregateSettlementErgoObservationSourcePair;
  readonly confirmationPolicy?: AggregateSettlementErgoFinalityPolicyV1;
  readonly submitter: AuthenticatedSettlementFixedSubmitter;
  revalidateImmediately(input: Readonly<{
    handoff: ReservedHandoff;
    signedArtifact: SignedArtifact;
  }>): Promise<AuthenticatedSettlementImmediateRevalidationEvidence>;
  authorizeBroadcast(input: Readonly<{
    handoff: ReservedHandoff;
    evidence: AuthenticatedSettlementImmediateRevalidationEvidence;
    preSubmitRevalidationDigestHex: string;
  }>): AuthenticatedSettlementBroadcastApproval;
  assertBroadcastApprovalCurrent(input: Readonly<{
    handoff: ReservedHandoff;
    approval: AuthenticatedSettlementBroadcastApproval;
    broadcastAuthorizationDigestHex: string;
  }>): Promise<void>;
}

export interface AuthenticatedSettlementRestartCompatibilityDeps {
  readonly state: AuthenticatedSettlementReservedExecutionState;
  readonly confirmationSources: AggregateSettlementErgoObservationSourcePair;
  readonly confirmationPolicy?: AggregateSettlementErgoFinalityPolicyV1;
}

export interface AuthenticatedSettlementRestartCompatibilityOutcome {
  readonly durableAttemptDigestHex: string;
  readonly status: 'reconciled' | 'failed';
  readonly result: AuthenticatedSettlementRestartReconciliationResult | null;
  readonly failureCode: 'reconciliation_failed' | null;
}

interface NormalizedImmediateEvidence
  extends AuthenticatedSettlementImmediateRevalidationEvidence {}

interface NormalizedBroadcastApproval
  extends AuthenticatedSettlementBroadcastApproval {}

type SubmissionOutcome = AuthenticatedSettlementFixedSubmissionResult;

interface BroadcastAuthorizationAuthority {
  readonly approval: NormalizedBroadcastApproval;
  readonly authorization: AuthenticatedSettlementOpaqueBroadcastAuthorization;
}

interface ObservationJournalOutcome
  extends AuthenticatedSettlementSubmissionObservationResult {
  readonly terminalStateRetained?: boolean;
}

const OPAQUE_BROADCAST_AUTHORIZATIONS = new WeakSet<object>();
const CONSUMED_BROADCAST_AUTHORIZATIONS = new WeakSet<object>();
const FIXED_SUBMITTERS = new WeakSet<object>();
const BROADCAST_AUTHORIZATION_SUBMITTERS =
  new WeakMap<object, AuthenticatedSettlementFixedSubmitter>();
const REGISTERED_RESERVED_EXECUTION_DEPS = new WeakSet<object>();
const REGISTERED_RESTART_DEPS = new WeakSet<object>();

export function createAuthenticatedSettlementFixedSubmitter(
  transport: Readonly<{
    submit(input: Readonly<{
      signedArtifact: SignedArtifact;
      authorization: AuthenticatedSettlementOpaqueBroadcastAuthorization;
    }>): Promise<AuthenticatedSettlementFixedSubmissionResult | null>;
  }>,
): AuthenticatedSettlementFixedSubmitter {
  if (typeof transport.submit !== 'function') {
    throw new Error(
      'authenticated settlement fixed submitter requires one transport function',
    );
  }
  const fixedSubmit = transport.submit.bind(transport);
  let submitter: AuthenticatedSettlementFixedSubmitter;
  submitter = Object.freeze({
    profile: FIXED_SUBMITTER_PROFILE,
    async submit(
      input: Parameters<AuthenticatedSettlementFixedSubmitter['submit']>[0],
    ) {
      assertFixedSubmitterProvenance(submitter);
      assertOpaqueAuthorizationForSubmitter(
        input.authorization,
        submitter,
      );
      if (CONSUMED_BROADCAST_AUTHORIZATIONS.has(input.authorization)) {
        throw new Error(
          'authenticated settlement broadcast authorization has already been consumed',
        );
      }
      CONSUMED_BROADCAST_AUTHORIZATIONS.add(input.authorization);
      const responsePromise = fixedSubmit(input);
      return responsePromise;
    },
  });
  FIXED_SUBMITTERS.add(submitter);
  return submitter;
}

export function createAuthenticatedSettlementReservedExecutionCompatibilityDeps(
  deps: AuthenticatedSettlementReservedExecutionCompatibilityDeps,
): AuthenticatedSettlementReservedExecutionCompatibilityDeps {
  assertFixedSubmitterProvenance(deps.submitter);
  const registered = Object.freeze({ ...deps });
  REGISTERED_RESERVED_EXECUTION_DEPS.add(registered);
  return registered;
}

export function createAuthenticatedSettlementRestartCompatibilityDeps(
  deps: AuthenticatedSettlementRestartCompatibilityDeps,
): AuthenticatedSettlementRestartCompatibilityDeps {
  const registered = Object.freeze({ ...deps });
  REGISTERED_RESTART_DEPS.add(registered);
  return registered;
}

/**
 * Continue one exact T8C1 handoff through the durable T8C2 boundary.
 *
 * This function is deliberately not imported by the existing daemon or CLI.
 * The caller must provide one fixed submitter and one explicit, recheckable
 * broadcast approval capability.
 */
export async function runAuthenticatedSettlementReservedExecutionCompatibility(
  handoff: ReservedHandoff,
  deps: AuthenticatedSettlementReservedExecutionCompatibilityDeps,
): Promise<LifecycleHandoff> {
  assertConcreteReservedHandoff(handoff);
  assertRegisteredReservedExecutionDeps(deps);

  const actualImmediateEvidence =
    new WeakMap<object, NormalizedImmediateEvidence>();
  const actualBroadcastAuthorizations =
    new WeakMap<object, BroadcastAuthorizationAuthority>();
  const actualSubmissionOutcomes =
    new WeakMap<object, SubmissionOutcome>();
  const actualConfirmationObservations =
    new WeakMap<object, MatchingAggregateSettlementErgoObservationResult>();

  return runAuthenticatedSettlementReservedExecution(handoff, {
    revalidateImmediately: async request => {
      exactObject(request.reservation, handoff.reservation, 'execution reservation');
      exactObject(request.signedArtifact, handoff.signedArtifact, 'signed artifact');
      assertCurrentAuthority(deps.state, handoff);
      const evidence = normalizeImmediateEvidence(
        await deps.revalidateImmediately({
          handoff,
          signedArtifact: handoff.signedArtifact,
        }),
      );
      assertCurrentAuthority(deps.state, handoff);
      const preSubmitRevalidationDigestHex = sha256CanonicalJson({
        domain: PRE_SUBMIT_REVALIDATION_DIGEST_DOMAIN,
        candidateId: handoff.identity.candidateId,
        expectedTxId: handoff.identity.expectedTxId,
        reservationDigestHex: handoff.identity.reservationDigestHex,
        signedTransactionDigestHex:
          handoff.identity.signedTransactionDigestHex,
        priorStableErgoViewDigestHex:
          handoff.identity.stableErgoViewDigestHex,
        priorStableSidechainViewDigestHex:
          handoff.identity.stableSidechainViewDigestHex,
        currentErgoViewDigestHex: evidence.currentErgoViewDigestHex,
        currentSidechainViewDigestHex:
          evidence.currentSidechainViewDigestHex,
      });
      const result = Object.freeze({
        ...lifecycleBinding(handoff),
        request,
        signedArtifact: request.signedArtifact,
        ...reservedDigests(handoff),
        preSubmitRevalidationDigestHex,
        status: 'valid',
      }) satisfies CoreImmediateRevalidation;
      actualImmediateEvidence.set(result, evidence);
      return result;
    },
    authorizeBroadcast: revalidation => {
      const evidence = mapped(
        actualImmediateEvidence,
        revalidation,
        'immediate revalidation evidence',
      );
      const approval = normalizeBroadcastApproval(
        deps.authorizeBroadcast({
          handoff,
          evidence,
          preSubmitRevalidationDigestHex:
            revalidation.preSubmitRevalidationDigestHex,
        }),
      );
      const broadcastAuthorizationDigestHex = sha256CanonicalJson({
        domain: BROADCAST_AUTHORIZATION_DIGEST_DOMAIN,
        candidateId: handoff.identity.candidateId,
        expectedTxId: handoff.identity.expectedTxId,
        reservationDigestHex: handoff.identity.reservationDigestHex,
        signedTransactionDigestHex:
          handoff.identity.signedTransactionDigestHex,
        preSubmitRevalidationDigestHex:
          revalidation.preSubmitRevalidationDigestHex,
        approvalDigestHex: approval.approvalDigestHex,
      });
      const authorization = Object.freeze({
        profile: OPAQUE_BROADCAST_AUTHORIZATION_PROFILE,
        candidateId: handoff.identity.candidateId,
        expectedTxId: handoff.identity.expectedTxId,
        signedTransactionDigestHex:
          handoff.identity.signedTransactionDigestHex,
        preSubmitRevalidationDigestHex:
          revalidation.preSubmitRevalidationDigestHex,
        approvalDigestHex: approval.approvalDigestHex,
        broadcastAuthorizationDigestHex,
      });
      OPAQUE_BROADCAST_AUTHORIZATIONS.add(authorization);
      BROADCAST_AUTHORIZATION_SUBMITTERS.set(
        authorization,
        deps.submitter,
      );
      const result = Object.freeze({
        ...lifecycleBinding(handoff),
        revalidation,
        signedArtifact: revalidation.signedArtifact,
        ...reservedDigests(handoff),
        preSubmitRevalidationDigestHex:
          revalidation.preSubmitRevalidationDigestHex,
        broadcastAuthorizationDigestHex,
      }) satisfies CoreBroadcastAuthorization;
      actualBroadcastAuthorizations.set(result, {
        approval,
        authorization,
      });
      return result;
    },
    reserveTransport: request => {
      mapped(
        actualBroadcastAuthorizations,
        request.authorization,
        'broadcast authorization',
      );
      const admission = authorizeAuthenticatedSettlementTransportAttempt({
        state: deps.state,
        request,
      });
      assertAuthenticatedSettlementTransportAttemptAdmissionProvenance(
        admission,
      );
      const attempt =
        deps.state.reserveAuthenticatedSettlementTransportAttempt(admission);
      assertAttemptMatchesAdmission(attempt, admission);
      return Object.freeze({
        ...lifecycleBinding(handoff),
        authorization: request.authorization,
        signedArtifact: request.signedArtifact,
        ...reservedDigests(handoff),
        preSubmitRevalidationDigestHex:
          admission.preSubmitRevalidationDigestHex,
        broadcastAuthorizationDigestHex:
          admission.broadcastAuthorizationDigestHex,
        transportReservationDigestHex:
          admission.transportReservationDigestHex,
        durableAttemptDigestHex: admission.durableAttemptDigestHex,
        applied: true,
        status: 'active',
      }) satisfies CoreTransportReservation;
    },
    submit: async request => {
      const authority = mapped(
        actualBroadcastAuthorizations,
        request.authorization,
        'broadcast authorization',
      );
      assertOpaqueBroadcastAuthorization(
        authority.authorization,
        request,
      );
      await deps.assertBroadcastApprovalCurrent({
        handoff,
        approval: authority.approval,
        broadcastAuthorizationDigestHex:
          authority.authorization.broadcastAuthorizationDigestHex,
      });
      assertCurrentAuthority(deps.state, handoff);

      // Start the fixed transport synchronously after the last approval check.
      const responsePromise = deps.submitter.submit(Object.freeze({
        signedArtifact: handoff.signedArtifact,
        authorization: authority.authorization,
      }));
      const rawOutcome = await responsePromise;
      if (rawOutcome === null) return null;
      const outcome = normalizeSubmissionOutcome(
        rawOutcome,
        handoff.identity.expectedTxId,
      );
      const result = Object.freeze({
        ...lifecycleBinding(handoff),
        request,
        signedArtifact: request.signedArtifact,
        ...transportDigests(request.transportReservation),
        status: outcome.status,
        submittedTxId: outcome.submittedTxId,
      }) satisfies CoreSubmitResult;
      actualSubmissionOutcomes.set(result, outcome);
      return result;
    },
    finalizeSubmission: ({ request, submission }) => {
      const outcome = submission === null
        ? Object.freeze({
            status: 'ambiguous',
            submittedTxId: null,
            responseDigestHex: null,
          }) satisfies SubmissionOutcome
        : mapped(
            actualSubmissionOutcomes,
            submission,
            'submission outcome',
          );
      const attempt =
        deps.state.finalizeAuthenticatedSettlementSubmissionAttempt({
          durableAttemptDigestHex:
            request.transportReservation.durableAttemptDigestHex,
          disposition: outcome.status,
          submittedTxId: outcome.submittedTxId,
          responseDigestHex: outcome.responseDigestHex,
        });
      assertFinalizedAttempt(attempt, request, outcome);
      return Object.freeze({
        ...lifecycleBinding(handoff),
        request,
        submission,
        ...transportDigests(request.transportReservation),
        applied: true,
        status: attempt.status,
        submittedTxId: attempt.submittedTxId,
      }) satisfies CoreSubmissionFinalization;
    },
    observeConfirmation: async finalization => {
      if (!finalization.submittedTxId) {
        throw new Error(
          'authenticated settlement confirmation requires a submitted transaction ID',
        );
      }
      const observed = await observeMatchingConfirmation({
        sources: deps.confirmationSources,
        policy: deps.confirmationPolicy,
        expectedTxId: finalization.submittedTxId,
      });
      const status = coreObservationStatus(observed.consensus.record.status);
      const observationDigestHex = deriveConfirmationObservationDigest({
        durableAttemptDigestHex: finalization.durableAttemptDigestHex,
        consensusDigestHex: observed.consensus.consensusDigestHex,
        status,
      });
      const result = Object.freeze({
        ...lifecycleBinding(handoff),
        finalization,
        ...transportDigests(finalization),
        observationDigestHex,
        status,
      }) satisfies CoreConfirmationObservation;
      actualConfirmationObservations.set(result, observed);
      return result;
    },
    recordConfirmation: observation => {
      const observed = mapped(
        actualConfirmationObservations,
        observation,
        'confirmation observation',
      );
      const journal = recordObservationOrRetainTerminalQuarantine(
        deps.state,
        {
          durableAttemptDigestHex: observation.durableAttemptDigestHex,
          observation: observed.primaryObservation,
          consensus: observed.consensus,
        },
      );
      return confirmationJournalResult(handoff, observation, journal);
    },
  });
}

/**
 * Reconcile every durable pending/submitted attempt by observation only.
 * No submitter, signed artifact, or broadcast authorization is accepted.
 */
export async function reconcileRecoverableAuthenticatedSettlementSubmissionsCompatibility(
  deps: AuthenticatedSettlementRestartCompatibilityDeps,
): Promise<readonly AuthenticatedSettlementRestartCompatibilityOutcome[]> {
  assertRegisteredRestartDeps(deps);
  const attempts =
    deps.state.getObservableAuthenticatedSettlementSubmissionAttempts();
  const outcomes: AuthenticatedSettlementRestartCompatibilityOutcome[] = [];
  for (const attempt of attempts) {
    const durable = durableIdentity(attempt);
    try {
      let observed:
        | MatchingAggregateSettlementErgoObservationResult
        | undefined;
      const result = await reconcileAuthenticatedSettlementSubmissionAttempt(
        durable,
        {
          observe: async exactDurable => {
            exactObject(exactDurable, durable, 'durable attempt');
            observed = await observeMatchingConfirmation({
              sources: deps.confirmationSources,
              policy: deps.confirmationPolicy,
              expectedTxId: durable.expectedTxId,
            });
            const status = restartObservationStatus(
              deps.state,
              attempt,
              observed.consensus.record,
            );
            return Object.freeze({
              ...durableBinding(durable),
              durable,
              status,
              observationDigestHex: deriveConfirmationObservationDigest({
                durableAttemptDigestHex: durable.durableAttemptDigestHex,
                consensusDigestHex: observed.consensus.consensusDigestHex,
                status,
              }),
            }) satisfies AuthenticatedSettlementRestartObservation;
          },
          record: ({ durable: exactDurable, observation }) => {
            exactObject(exactDurable, durable, 'restart durable attempt');
            if (!observed) {
              throw new Error(
                'authenticated settlement restart observation is unavailable',
              );
            }
            const journal = recordObservationOrRetainTerminalQuarantine(
              deps.state,
              {
                durableAttemptDigestHex: durable.durableAttemptDigestHex,
                observation: observed.primaryObservation,
                consensus: observed.consensus,
              },
            );
            return restartJournalResult(durable, observation, journal);
          },
        },
      );
      outcomes.push(Object.freeze({
        durableAttemptDigestHex: durable.durableAttemptDigestHex,
        status: 'reconciled',
        result,
        failureCode: null,
      }));
    } catch {
      outcomes.push(Object.freeze({
        durableAttemptDigestHex: durable.durableAttemptDigestHex,
        status: 'failed',
        result: null,
        failureCode: 'reconciliation_failed',
      }));
    }
  }
  return Object.freeze(outcomes);
}

function assertConcreteReservedHandoff(handoff: ReservedHandoff): void {
  assertAuthenticatedSettlementReservedHandoffProvenance(handoff);
  assertAuthenticatedSettlementSignedCheckCandidateProvenance(
    handoff.signedArtifact,
  );
  const signed = handoff.signedArtifact;
  if (
    fixedHex(signed.candidateId, 'signed candidate ID')
      !== handoff.identity.candidateId
    || fixedHex(signed.expectedTxId, 'signed expected transaction ID')
      !== handoff.identity.expectedTxId
    || fixedHex(
      signed.unsignedTxDigestHex,
      'signed unsigned-transaction digest',
    ) !== handoff.identity.unsignedTxDigestHex
    || fixedHex(
      signed.unsignedPackageDigestHex,
      'signed unsigned-package digest',
    ) !== handoff.identity.unsignedPackageDigestHex
    || fixedHex(
      signed.signedTransactionDigestHex,
      'signed transaction digest',
    ) !== handoff.identity.signedTransactionDigestHex
  ) {
    throw new Error(
      'authenticated settlement signed artifact does not match the reserved handoff',
    );
  }
}

function assertCurrentAuthority(
  state: AuthenticatedSettlementReservedExecutionState,
  handoff: ReservedHandoff,
): void {
  assertAuthenticatedSettlementTransportAttemptCurrentAuthority(state, {
    executionReservationDigestHex: handoff.identity.reservationDigestHex,
    candidateId: handoff.identity.candidateId,
    expectedTxId: handoff.identity.expectedTxId,
    unsignedTxDigestHex: handoff.identity.unsignedTxDigestHex,
    unsignedPackageDigestHex: handoff.identity.unsignedPackageDigestHex,
    payoutDigestHex: handoff.identity.payoutDigestHex,
    trackerBoxId: handoff.identity.trackerBoxId,
    duplicatePreventionBoxId:
      handoff.identity.duplicatePreventionBoxId,
    signedTransactionDigestHex:
      handoff.identity.signedTransactionDigestHex,
  });
}

function lifecycleBinding(
  handoff: ReservedHandoff,
): AuthenticatedSettlementLifecycleBinding<Candidate> {
  return {
    candidate: handoff.candidate,
    candidateId: handoff.identity.candidateId,
    expectedTxId: handoff.identity.expectedTxId,
    unsignedTxDigestHex: handoff.identity.unsignedTxDigestHex,
    unsignedPackageDigestHex: handoff.identity.unsignedPackageDigestHex,
    payoutDigestHex: handoff.identity.payoutDigestHex,
    trackerBoxId: handoff.identity.trackerBoxId,
    duplicatePreventionBoxId:
      handoff.identity.duplicatePreventionBoxId,
  };
}

function reservedDigests(handoff: ReservedHandoff) {
  return {
    revalidationDigestHex: handoff.identity.revalidationDigestHex,
    packageBindingDigestHex: handoff.identity.packageBindingDigestHex,
    signedTransactionDigestHex:
      handoff.identity.signedTransactionDigestHex,
    signerContextDigestHex: handoff.identity.signerContextDigestHex,
    checkResponseDigestHex: handoff.identity.checkResponseDigestHex,
    checkerIdentityDigestHex: handoff.identity.checkerIdentityDigestHex,
    stableErgoViewDigestHex: handoff.identity.stableErgoViewDigestHex,
    stableSidechainViewDigestHex:
      handoff.identity.stableSidechainViewDigestHex,
    admissionDigestHex: handoff.identity.admissionDigestHex,
    authorizationDigestHex: handoff.identity.authorizationDigestHex,
    reservationDigestHex: handoff.identity.reservationDigestHex,
  };
}

function transportDigests(
  input: CoreTransportReservation | CoreSubmissionFinalization,
) {
  return {
    revalidationDigestHex: input.revalidationDigestHex,
    packageBindingDigestHex: input.packageBindingDigestHex,
    signedTransactionDigestHex: input.signedTransactionDigestHex,
    signerContextDigestHex: input.signerContextDigestHex,
    checkResponseDigestHex: input.checkResponseDigestHex,
    checkerIdentityDigestHex: input.checkerIdentityDigestHex,
    stableErgoViewDigestHex: input.stableErgoViewDigestHex,
    stableSidechainViewDigestHex: input.stableSidechainViewDigestHex,
    admissionDigestHex: input.admissionDigestHex,
    authorizationDigestHex: input.authorizationDigestHex,
    reservationDigestHex: input.reservationDigestHex,
    preSubmitRevalidationDigestHex:
      input.preSubmitRevalidationDigestHex,
    broadcastAuthorizationDigestHex:
      input.broadcastAuthorizationDigestHex,
    transportReservationDigestHex:
      input.transportReservationDigestHex,
    durableAttemptDigestHex: input.durableAttemptDigestHex,
  };
}

function normalizeImmediateEvidence(
  evidence: AuthenticatedSettlementImmediateRevalidationEvidence,
): NormalizedImmediateEvidence {
  return Object.freeze({
    currentErgoViewDigestHex: fixedHex(
      evidence.currentErgoViewDigestHex,
      'current Ergo view digest',
    ),
    currentSidechainViewDigestHex: fixedHex(
      evidence.currentSidechainViewDigestHex,
      'current sidechain view digest',
    ),
  });
}

function normalizeBroadcastApproval(
  approval: AuthenticatedSettlementBroadcastApproval,
): NormalizedBroadcastApproval {
  return Object.freeze({
    approvalDigestHex: fixedHex(
      approval.approvalDigestHex,
      'broadcast approval digest',
    ),
  });
}

function normalizeSubmissionOutcome(
  outcome: AuthenticatedSettlementFixedSubmissionResult,
  expectedTxId: string,
): SubmissionOutcome {
  if (outcome.status === 'accepted') {
    const submittedTxId = fixedHex(
      outcome.submittedTxId,
      'submitted transaction ID',
    );
    if (submittedTxId !== expectedTxId) {
      throw new Error(
        'authenticated settlement submitter returned a transaction ID outside the authorization',
      );
    }
    return Object.freeze({
      status: outcome.status,
      submittedTxId,
      responseDigestHex: fixedHex(
        outcome.responseDigestHex,
        'submission response digest',
      ),
    });
  }
  if (outcome.submittedTxId !== null) {
    throw new Error(
      'non-accepted authenticated settlement submission cannot carry a transaction ID',
    );
  }
  return Object.freeze({
    status: outcome.status,
    submittedTxId: null,
    responseDigestHex: outcome.responseDigestHex === null
      ? null
      : fixedHex(
          outcome.responseDigestHex,
          'submission response digest',
        ),
  }) as SubmissionOutcome;
}

function assertOpaqueBroadcastAuthorization(
  authorization: AuthenticatedSettlementOpaqueBroadcastAuthorization,
  request: CoreSubmitRequest,
): void {
  if (
    !OPAQUE_BROADCAST_AUTHORIZATIONS.has(authorization)
    || authorization.profile !== OPAQUE_BROADCAST_AUTHORIZATION_PROFILE
    || authorization.candidateId !== request.authorization.candidateId
    || authorization.expectedTxId !== request.authorization.expectedTxId
    || authorization.signedTransactionDigestHex
      !== request.signedTransactionDigestHex
    || authorization.preSubmitRevalidationDigestHex
      !== request.authorization.preSubmitRevalidationDigestHex
    || authorization.broadcastAuthorizationDigestHex
      !== request.authorization.broadcastAuthorizationDigestHex
  ) {
    throw new Error(
      'authenticated settlement broadcast authorization provenance is missing or invalid',
    );
  }
}

function assertFixedSubmitterProvenance(
  submitter: AuthenticatedSettlementFixedSubmitter,
): void {
  if (
    typeof submitter !== 'object'
    || submitter === null
    || !FIXED_SUBMITTERS.has(submitter)
    || submitter.profile !== FIXED_SUBMITTER_PROFILE
    || !Object.isFrozen(submitter)
  ) {
    throw new Error(
      'authenticated settlement fixed submitter provenance is missing',
    );
  }
}

function assertOpaqueAuthorizationForSubmitter(
  authorization: AuthenticatedSettlementOpaqueBroadcastAuthorization,
  submitter: AuthenticatedSettlementFixedSubmitter,
): void {
  if (
    !OPAQUE_BROADCAST_AUTHORIZATIONS.has(authorization)
    || BROADCAST_AUTHORIZATION_SUBMITTERS.get(authorization) !== submitter
  ) {
    throw new Error(
      'authenticated settlement broadcast authorization is not bound to the fixed submitter',
    );
  }
}

function assertRegisteredReservedExecutionDeps(
  deps: AuthenticatedSettlementReservedExecutionCompatibilityDeps,
): void {
  if (
    !REGISTERED_RESERVED_EXECUTION_DEPS.has(deps)
    || !Object.isFrozen(deps)
  ) {
    throw new Error(
      'authenticated settlement reserved-execution adapters are not process registered',
    );
  }
  assertFixedSubmitterProvenance(deps.submitter);
}

function recordObservationOrRetainTerminalQuarantine(
  state: AuthenticatedSettlementReservedExecutionState,
  input: Parameters<
    StateTracker['recordAuthenticatedSettlementSubmissionObservation']
  >[0],
): ObservationJournalOutcome {
  try {
    return state.recordAuthenticatedSettlementSubmissionObservation(input);
  } catch (error) {
    const attempt = state.getAuthenticatedSettlementSubmissionAttempt({
      durableAttemptDigestHex: input.durableAttemptDigestHex,
    });
    if (!attempt || attempt.status !== 'quarantined') throw error;
    return Object.freeze({
      applied: false,
      terminalStateRetained: true,
      status: 'quarantined',
      attempt,
    });
  }
}

function assertRegisteredRestartDeps(
  deps: AuthenticatedSettlementRestartCompatibilityDeps,
): void {
  if (!REGISTERED_RESTART_DEPS.has(deps) || !Object.isFrozen(deps)) {
    throw new Error(
      'authenticated settlement restart adapters are not process registered',
    );
  }
}

function assertAttemptMatchesAdmission(
  attempt: AuthenticatedSettlementSubmissionAttempt,
  admission: Readonly<{
    candidateId: string;
    expectedTxId: string;
    transportReservationDigestHex: string;
    durableAttemptDigestHex: string;
  }>,
): void {
  if (
    attempt.status !== 'pending'
    || attempt.candidateId !== admission.candidateId
    || attempt.expectedTxId !== admission.expectedTxId
    || attempt.transportReservationDigestHex
      !== admission.transportReservationDigestHex
    || attempt.durableAttemptDigestHex !== admission.durableAttemptDigestHex
  ) {
    throw new Error(
      'authenticated settlement transport reservation was not journaled exactly',
    );
  }
}

function assertFinalizedAttempt(
  attempt: AuthenticatedSettlementSubmissionAttempt,
  request: CoreSubmitRequest,
  outcome: SubmissionOutcome,
): void {
  const expectedStatus = outcome.status === 'accepted'
    ? 'submitted'
    : outcome.status === 'rejected'
      ? 'rejected'
      : 'pending';
  if (
    attempt.durableAttemptDigestHex
      !== request.transportReservation.durableAttemptDigestHex
    || attempt.status !== expectedStatus
    || attempt.submissionDisposition !== outcome.status
    || attempt.submittedTxId !== outcome.submittedTxId
    || attempt.responseDigestHex !== outcome.responseDigestHex
  ) {
    throw new Error(
      'authenticated settlement submission finalization was not journaled exactly',
    );
  }
}

async function observeMatchingConfirmation(input: {
  readonly sources: AggregateSettlementErgoObservationSourcePair;
  readonly policy?: AggregateSettlementErgoFinalityPolicyV1;
  readonly expectedTxId: string;
}): Promise<MatchingAggregateSettlementErgoObservationResult> {
  return observeMatchingAggregateSettlementErgoTransaction({
    primary: input.sources.primarySource,
    witness: input.sources.witnessSource,
    transactionId: input.expectedTxId,
    policy: input.policy,
  });
}

function coreObservationStatus(
  status: AggregateSettlementErgoObservationStatus,
): AuthenticatedSettlementConfirmationObservationStatus {
  if (status === 'confirmed_final') return 'confirmed';
  if (status === 'mempool' || status === 'confirmed_pre_finality') {
    return 'submitted_unconfirmed';
  }
  return 'inconclusive';
}

function restartObservationStatus(
  state: AuthenticatedSettlementReservedExecutionState,
  attempt: AuthenticatedSettlementSubmissionAttempt,
  observation: AggregateSettlementErgoObservationRecord,
): AuthenticatedSettlementConfirmationObservationStatus {
  const reservation = state.getAuthenticatedSettlementExecutionReservation({
    reservationDigestHex: attempt.executionReservationDigestHex,
  });
  if (!reservation || reservation.status !== 'active') return 'stale';
  if (attempt.status !== 'confirmed') {
    return coreObservationStatus(observation.status);
  }
  if (observation.status !== 'confirmed_final') return 'stale';
  const prior = attempt.ergoObservation;
  if (
    prior === null
    || prior.transactionIdHex !== observation.transactionIdHex
    || prior.transactionDigestHex !== observation.transactionDigestHex
    || prior.inclusionHeight !== observation.inclusionHeight
    || prior.inclusionHeaderIdHex !== observation.inclusionHeaderIdHex
  ) {
    return 'reorged';
  }
  return 'confirmed';
}

function deriveConfirmationObservationDigest(input: {
  readonly durableAttemptDigestHex: string;
  readonly consensusDigestHex: string;
  readonly status: AuthenticatedSettlementConfirmationObservationStatus;
}): string {
  return sha256CanonicalJson({
    domain: CONFIRMATION_OBSERVATION_DIGEST_DOMAIN,
    durableAttemptDigestHex: fixedHex(
      input.durableAttemptDigestHex,
      'durable attempt digest',
    ),
    consensusDigestHex: fixedHex(
      input.consensusDigestHex,
      'confirmation consensus digest',
    ),
    status: input.status,
  });
}

function confirmationJournalResult(
  handoff: ReservedHandoff,
  observation: CoreConfirmationObservation,
  journal: ObservationJournalOutcome,
): CoreConfirmationJournalResult {
  return Object.freeze({
    ...lifecycleBinding(handoff),
    observation,
    ...transportDigests(observation.finalization),
    observationDigestHex: observation.observationDigestHex,
    applied: journal.applied,
    terminalStateRetained: journal.terminalStateRetained,
    status: journal.status,
  });
}

function durableIdentity(
  attempt: AuthenticatedSettlementSubmissionAttempt,
): AuthenticatedSettlementDurableSubmissionIdentity {
  if (
    attempt.status !== 'pending'
    && attempt.status !== 'submitted'
    && attempt.status !== 'confirmed'
  ) {
    throw new Error(
      'authenticated settlement restart requires an observable durable attempt',
    );
  }
  return Object.freeze({
    candidateId: attempt.candidateId,
    expectedTxId: attempt.expectedTxId,
    unsignedTxDigestHex: attempt.unsignedTxDigestHex,
    unsignedPackageDigestHex: attempt.unsignedPackageDigestHex,
    payoutDigestHex: attempt.payoutDigestHex,
    trackerBoxId: attempt.trackerBoxId,
    duplicatePreventionBoxId: attempt.duplicatePreventionBoxId,
    status: attempt.status,
    submissionAttempted: true,
    signedTransactionDigestHex: attempt.signedTransactionDigestHex,
    transportReservationDigestHex:
      attempt.transportReservationDigestHex,
    durableAttemptDigestHex: attempt.durableAttemptDigestHex,
  });
}

function durableBinding(
  durable: AuthenticatedSettlementDurableSubmissionIdentity,
) {
  return {
    candidateId: durable.candidateId,
    expectedTxId: durable.expectedTxId,
    unsignedTxDigestHex: durable.unsignedTxDigestHex,
    unsignedPackageDigestHex: durable.unsignedPackageDigestHex,
    payoutDigestHex: durable.payoutDigestHex,
    trackerBoxId: durable.trackerBoxId,
    duplicatePreventionBoxId: durable.duplicatePreventionBoxId,
    submissionAttempted: true as const,
    signedTransactionDigestHex: durable.signedTransactionDigestHex,
    transportReservationDigestHex:
      durable.transportReservationDigestHex,
    durableAttemptDigestHex: durable.durableAttemptDigestHex,
  };
}

function restartJournalResult(
  durable: AuthenticatedSettlementDurableSubmissionIdentity,
  observation: AuthenticatedSettlementRestartObservation,
  journal: ObservationJournalOutcome,
): AuthenticatedSettlementRestartJournalResult {
  return Object.freeze({
    observation,
    ...durableBinding(durable),
    observationDigestHex: observation.observationDigestHex,
    applied: journal.applied,
    terminalStateRetained: journal.terminalStateRetained,
    status: journal.status,
  });
}

function mapped<K extends object, V>(
  map: WeakMap<K, V>,
  key: K,
  label: string,
): V {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`authenticated settlement ${label} provenance is missing`);
  }
  return value;
}

function exactObject(left: object, right: object, label: string): void {
  if (left !== right) {
    throw new Error(`authenticated settlement ${label} identity changed`);
  }
}

function fixedHex(value: string, label: string): string {
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(`${label} must be 32 bytes of hex`);
  }
  return clean.toLowerCase();
}
