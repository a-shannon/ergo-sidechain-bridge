import {
  projectLocalWasmSignedCheckInputBoxIdsV1,
} from '../../fleet-signer.js';
import {
  substrateFederatedIsolatedDevnetTrackerAdmissionPersistenceStoreIdentityHexV1,
  type ReserveSubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1Result,
  type StateTracker,
  type SubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1,
} from '../../state-tracker.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2,
  type SubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetBindingV1,
  type SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2,
} from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1,
  type SubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1,
} from '../../substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import {
  createSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1,
  type SubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1,
  type SubstrateFederatedIsolatedDevnetTrackerTransportResponseCategoryV1,
} from '../../adapters/substrate-federated-isolated-devnet-tracker-transport-response-v1.js';
import {
  sha256CanonicalJson,
} from '../../ergo-settlement-core/strict-json.js';
import {
  consumeSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1,
  projectSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingDigestV1,
  type SubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1,
} from '../../adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1,
  consumeSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1,
  type SubstrateFederatedIsolatedDevnetPacketRelayerLineageV1,
} from '../../substrate-federated-isolated-devnet-packet-producer-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1PersistenceStore,
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1Provenance,
  type SubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1,
} from './substrate-federated-isolated-devnet-tracker-admission-reservation-authorization-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_AUTHORIZATION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-tracker-transport-authorization.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_DURABLE_ATTEMPT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-tracker-transport-durable-attempt.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_OUTCOME_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-tracker-transport-outcome.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_PREFLIGHT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-tracker-transport-preflight.v1' as const;

const AUTHORIZATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_AUTHORIZATION_V1';
const OUTCOME_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_OUTCOME_V1';
const PREFLIGHT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_PREFLIGHT_V1';

const CONSUMED_EXECUTION_CHECKS = new WeakSet<object>();
const AUTHORIZATIONS = new WeakMap<object, Readonly<{
  readonly executionCheck:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1>;
  readonly target:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2>;
  readonly binding:
    Readonly<SubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetBindingV1>;
  readonly durableReservation:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1>;
  readonly authorizationDigestHex: string;
}>>();
const JOURNALS = new WeakMap<object, Readonly<{
  readonly state: TrackerTransportJournalStateV1;
  readonly persistenceStoreIdentityHex: string;
  readonly durableReservation:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1>;
}>>();
const DURABLE_ATTEMPTS = new WeakMap<object, Readonly<{
  readonly journal: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportJournalV1>;
  readonly authorization:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1>;
  readonly persisted:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1>;
}>>();
const CLAIMED_DURABLE_ATTEMPTS = new WeakSet<object>();
const PREFLIGHTED_DURABLE_ATTEMPTS = new WeakSet<object>();
const CONSUMED_PREFLIGHTS = new WeakSet<object>();
const TRANSPORT_PREFLIGHTS = new WeakMap<object, Readonly<{
  readonly target:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2>;
  readonly executionCheck:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1>;
  readonly authorization:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1>;
  readonly journal:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportJournalV1>;
  readonly attempt:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1>;
  readonly preflightDigestHex: string;
}>>();
const TRANSPORT_RESULTS = new WeakMap<object, Readonly<{
  readonly journal: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportJournalV1>;
  readonly attempt:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1>;
  readonly submission: Readonly<{
    readonly status: 'accepted' | 'ambiguous';
    readonly submittedTransactionIdHex: string | null;
    readonly responseDigestHex: string;
    readonly responseClassification: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1
    >;
  }>;
}>>();
const OUTCOME_RESPONSE_CLASSIFICATIONS = new WeakMap<object, Readonly<
  SubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1
>>();

export interface SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_AUTHORIZATION_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'exact_fresh_checked_tracker_authorized_for_one_local_attempt';
  readonly reservationIdentityHex: string;
  readonly durableReservationDigestHex: string;
  readonly expectedTransactionIdHex: string;
  readonly inputBoxIdsHex: readonly string[];
  readonly attemptedAtHeight: number;
  readonly reservationFreshnessReceiptDigestHex: string;
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly signedTransactionBytesSha256Hex: string;
  readonly signedTransactionBytesLength: number;
  readonly checkResponseDigestHex: string;
  readonly boundaries: Readonly<{
    readonly localIsolatedDevnetOnly: true;
    readonly exactDurableReservationBound: true;
    readonly exactFreshnessCheckConsumed: true;
    readonly completeSignedInputProjectionBound: true;
    readonly oneAttemptAuthorizationEstablished: true;
    readonly transportAttemptPersisted: false;
    readonly trackerSubmissionPerformed: false;
    readonly trackerAdmissionEstablished: false;
    readonly deterministicSourceFinalityEstablished: false;
    readonly ergoPowAuthenticated: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly authorizationDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_DURABLE_ATTEMPT_V1_SCHEMA;
  readonly version: 1;
  readonly expectedTransactionIdHex: string;
  readonly durableAttemptDigestHex: string;
  readonly authorization:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1>;
  readonly durableArtifact: Readonly<{
    readonly schema:
      typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_DURABLE_ATTEMPT_V1_SCHEMA;
    readonly expectedTransactionIdHex: string;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_PREFLIGHT_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'fresh_campaign_bound_before_one_local_post';
  readonly headCommitSha1Hex: string;
  readonly requestSha256Hex: string;
  readonly relayerArtifactSetDigestHex: string;
  readonly packetReceiptDigestHex: string;
  readonly reservationIdentityHex: string;
  readonly persistenceStoreIdentityHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly expectedTransactionIdHex: string;
  readonly durableAttemptDigestHex: string;
  readonly authorizationDigestHex: string;
  readonly checks: Readonly<{
    readonly exactHeadAndRequestBound: true;
    readonly exactRelayerPacketLineageBound: true;
    readonly exactTargetAndCandidateBound: true;
    readonly exactDurableAttemptObservedPending: true;
    readonly absentPriorAttemptEstablishedByAtomicInsert: true;
    readonly singleUseAuthorizationBound: true;
  }>;
  readonly boundaries: Readonly<{
    readonly localIsolatedDevnetOnly: true;
    readonly transportPerformed: false;
    readonly trackerAdmissionEstablished: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly preflightDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetTrackerTransportResultV1 {
  readonly status: 'accepted' | 'ambiguous';
  readonly submittedTransactionIdHex: string | null;
  readonly responseDigestHex: string;
  readonly responseClassification: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1
  >;
  readonly resultArtifact: Readonly<{
    readonly schema:
      typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_OUTCOME_V1_SCHEMA;
    readonly expectedTransactionIdHex: string;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetTrackerTransportOutcomeV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_OUTCOME_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'accepted' | 'ambiguous';
  readonly expectedTransactionIdHex: string;
  readonly submittedTransactionIdHex: string | null;
  readonly durableAttemptDigestHex: string;
  readonly responseDigestHex: string;
  readonly trackerAdmissionEstablished: false;
  readonly outcomeDigestHex: string;
}

interface TrackerTransportJournalStateV1 {
  reserveSubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1:
    StateTracker['reserveSubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1'];
  getSubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1:
    StateTracker['getSubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1'];
  finalizeSubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1:
    StateTracker['finalizeSubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1'];
}

export interface SubstrateFederatedIsolatedDevnetTrackerTransportJournalV1 {
  reserve(
    authorization:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1>,
  ): Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1>;
  finalize(
    attempt:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1>,
    result:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportResultV1>,
  ): Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportOutcomeV1>;
}

export function authorizeSubstrateFederatedIsolatedDevnetTrackerTransportV1(
  input: Readonly<{
    executionCheck:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1>;
    target: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2>;
    durableReservation:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1>;
  }>,
): Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1> {
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1Provenance(
    input.durableReservation,
  );
  const binding =
    assertSubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1(
      input.executionCheck,
      input.target,
    );
  if (CONSUMED_EXECUTION_CHECKS.has(input.executionCheck)) {
    throw new Error(
      'isolated tracker transport execution check is already authorized',
    );
  }
  const check = input.executionCheck.receipt;
  const signed = input.executionCheck.signedCandidate;
  const handle = input.executionCheck.checkedAcceptance.submissionHandle;
  const inputBoxIdsHex = projectLocalWasmSignedCheckInputBoxIdsV1(signed);
  if (
    input.durableReservation.bindings.unsignedTransactionIdHex
      !== check.unsignedTransactionIdHex
    || check.signedTransactionIdHex !== check.unsignedTransactionIdHex
    || signed.txId !== check.signedTransactionIdHex
    || handle.txId !== check.signedTransactionIdHex
    || input.durableReservation.bindings.trackerInputBoxIdHex
      !== check.trackerInputBoxIdHex
    || !inputBoxIdsHex.includes(check.trackerInputBoxIdHex)
    || signed.signedTransactionDigestHex
      !== handle.signedTransactionDigestHex
    || signed.signedTransactionBytesSha256Hex
      !== handle.signedTransactionBytesSha256Hex
    || signed.signedTransactionBytesLength
      !== handle.signedTransactionBytesLength
    || check.signedTransactionBytesSha256Hex
      !== handle.signedTransactionBytesSha256Hex
    || check.signedTransactionBytesLength
      !== handle.signedTransactionBytesLength
    || binding.processBindingDigestHex.length !== 64
    || binding.executionTargetIdentityDigestHex.length !== 64
  ) {
    throw new Error(
      'isolated tracker transport authorization binding changed',
    );
  }
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_AUTHORIZATION_V1_SCHEMA,
    version: 1 as const,
    status:
      'exact_fresh_checked_tracker_authorized_for_one_local_attempt' as const,
    reservationIdentityHex: fixedHex32(
      input.durableReservation.reservationIdentityHex,
      'tracker transport reservation identity',
    ),
    durableReservationDigestHex: fixedHex32(
      input.durableReservation.durableReservationDigestHex,
      'tracker transport durable reservation digest',
    ),
    expectedTransactionIdHex: fixedHex32(
      check.signedTransactionIdHex,
      'tracker transport expected transaction ID',
    ),
    inputBoxIdsHex: Object.freeze([...inputBoxIdsHex]),
    attemptedAtHeight: nonNegativeInteger(
      check.signer.stateContextTipHeight,
      'tracker transport attempt height',
    ),
    reservationFreshnessReceiptDigestHex: fixedHex32(
      check.receiptDigestHex,
      'tracker reservation freshness receipt digest',
    ),
    processBindingDigestHex: fixedHex32(
      binding.processBindingDigestHex,
      'tracker transport process binding digest',
    ),
    executionTargetIdentityDigestHex: fixedHex32(
      binding.executionTargetIdentityDigestHex,
      'tracker transport target identity digest',
    ),
    signedTransactionDigestHex: fixedHex32(
      signed.signedTransactionDigestHex,
      'tracker transport signed transaction digest',
    ),
    signedTransactionBytesSha256Hex: fixedHex32(
      signed.signedTransactionBytesSha256Hex,
      'tracker transport signed transaction bytes digest',
    ),
    signedTransactionBytesLength: positiveInteger(
      signed.signedTransactionBytesLength,
      'tracker transport signed transaction bytes length',
    ),
    checkResponseDigestHex: fixedHex32(
      handle.checkResponseDigestHex,
      'tracker transport check response digest',
    ),
    boundaries: Object.freeze({
      localIsolatedDevnetOnly: true as const,
      exactDurableReservationBound: true as const,
      exactFreshnessCheckConsumed: true as const,
      completeSignedInputProjectionBound: true as const,
      oneAttemptAuthorizationEstablished: true as const,
      transportAttemptPersisted: false as const,
      trackerSubmissionPerformed: false as const,
      trackerAdmissionEstablished: false as const,
      deterministicSourceFinalityEstablished: false as const,
      ergoPowAuthenticated: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  });
  const authorization = Object.freeze({
    ...body,
    authorizationDigestHex: sha256CanonicalJson(
      body,
      AUTHORIZATION_DIGEST_DOMAIN,
    ),
  });
  CONSUMED_EXECUTION_CHECKS.add(input.executionCheck);
  AUTHORIZATIONS.set(authorization, Object.freeze({
    executionCheck: input.executionCheck,
    target: input.target,
    binding,
    durableReservation: input.durableReservation,
    authorizationDigestHex: authorization.authorizationDigestHex,
  }));
  return authorization;
}

export function assertSubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1(
  value: unknown,
  target: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2>,
  executionCheck:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1>,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1
> {
  if (value === null || typeof value !== 'object' || !Object.isFrozen(value)) {
    throw new Error(
      'isolated tracker transport authorization lacks exact provenance',
    );
  }
  const material = AUTHORIZATIONS.get(value);
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2(target);
  const authorization = value as Readonly<
    SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1
  >;
  const { authorizationDigestHex, ...body } = authorization;
  if (
    material === undefined
    || material.target !== target
    || material.executionCheck !== executionCheck
    || material.binding.processBindingDigestHex
      !== current.processBindingDigestHex
    || material.binding.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || material.authorizationDigestHex !== authorizationDigestHex
    || authorization.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_AUTHORIZATION_V1_SCHEMA
    || authorization.version !== 1
    || sha256CanonicalJson(body, AUTHORIZATION_DIGEST_DOMAIN)
      !== authorizationDigestHex
  ) {
    throw new Error(
      'isolated tracker transport authorization binding changed',
    );
  }
}

export function createSubstrateFederatedIsolatedDevnetTrackerTransportJournalV1(
  input: Readonly<{
    state: TrackerTransportJournalStateV1;
    durableReservation:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1>;
  }>,
): Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportJournalV1> {
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1Provenance(
    input.durableReservation,
  );
  const persistenceStoreIdentityHex =
    substrateFederatedIsolatedDevnetTrackerAdmissionPersistenceStoreIdentityHexV1(
      input.state,
    );
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1PersistenceStore(
    input.durableReservation,
    input.state,
  );
  let journal!: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerTransportJournalV1
  >;
  journal = Object.freeze({
    reserve: (
      authorization: Readonly<
        SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1
      >,
    ) => {
      assertAuthorizationMatchesReservation(
        authorization,
        input.durableReservation,
      );
      const result: Readonly<
        ReserveSubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1Result
      > = input.state
        .reserveSubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1({
          reservationIdentityHex: authorization.reservationIdentityHex,
          durableReservationDigestHex:
            authorization.durableReservationDigestHex,
          expectedTransactionIdHex: authorization.expectedTransactionIdHex,
          inputBoxIdsHex: authorization.inputBoxIdsHex,
          attemptedAtHeight: authorization.attemptedAtHeight,
          reservationFreshnessReceiptDigestHex:
            authorization.reservationFreshnessReceiptDigestHex,
          processBindingDigestHex: authorization.processBindingDigestHex,
          executionTargetIdentityDigestHex:
            authorization.executionTargetIdentityDigestHex,
          signedTransactionDigestHex:
            authorization.signedTransactionDigestHex,
          signedTransactionBytesSha256Hex:
            authorization.signedTransactionBytesSha256Hex,
          signedTransactionBytesLength:
            authorization.signedTransactionBytesLength,
          checkResponseDigestHex: authorization.checkResponseDigestHex,
          authorizationDigestHex: authorization.authorizationDigestHex,
        });
      assertPersistedAttemptMatchesAuthorization(result.attempt, authorization);
      if (!result.created) {
        throw new Error(
          'durable tracker transport attempt already exists; reconcile before any POST',
        );
      }
      const durableArtifact = Object.freeze({
        schema:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_DURABLE_ATTEMPT_V1_SCHEMA,
        expectedTransactionIdHex: authorization.expectedTransactionIdHex,
      });
      const attempt = Object.freeze({
        schema:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_DURABLE_ATTEMPT_V1_SCHEMA,
        version: 1 as const,
        expectedTransactionIdHex: authorization.expectedTransactionIdHex,
        durableAttemptDigestHex: result.attempt.durableAttemptDigestHex,
        authorization,
        durableArtifact,
      });
      DURABLE_ATTEMPTS.set(durableArtifact, Object.freeze({
        journal,
        authorization,
        persisted: result.attempt,
      }));
      return attempt;
    },
    finalize: (
      attempt: Readonly<
        SubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1
      >,
      result: Readonly<
        SubstrateFederatedIsolatedDevnetTrackerTransportResultV1
      >,
    ) => {
      const material = requireDurableAttempt(journal, attempt);
      const submission = requireTransportResult(journal, attempt, result);
      const finalized = input.state
        .finalizeSubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1({
          expectedTransactionIdHex: attempt.expectedTransactionIdHex,
          durableAttemptDigestHex: attempt.durableAttemptDigestHex,
          disposition: submission.status,
          submittedTransactionIdHex: submission.submittedTransactionIdHex,
          responseDigestHex: submission.responseDigestHex,
        });
      assertPersistedAttemptMatchesAuthorization(
        finalized,
        material.authorization,
      );
      TRANSPORT_RESULTS.delete(result.resultArtifact);
      const body = Object.freeze({
        schema:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_OUTCOME_V1_SCHEMA,
        version: 1 as const,
        status: finalized.status as 'accepted' | 'ambiguous',
        expectedTransactionIdHex: finalized.expectedTransactionIdHex,
        submittedTransactionIdHex: finalized.submittedTransactionIdHex,
        durableAttemptDigestHex: finalized.durableAttemptDigestHex,
        responseDigestHex: finalized.responseDigestHex!,
        trackerAdmissionEstablished: false as const,
      });
      const outcome = Object.freeze({
        ...body,
        outcomeDigestHex: sha256CanonicalJson(body, OUTCOME_DIGEST_DOMAIN),
      });
      OUTCOME_RESPONSE_CLASSIFICATIONS.set(
        outcome,
        submission.responseClassification,
      );
      return outcome;
    },
  });
  JOURNALS.set(journal, Object.freeze({
    state: input.state,
    persistenceStoreIdentityHex,
    durableReservation: input.durableReservation,
  }));
  return journal;
}

/**
 * Bind the fresh request and reviewed relayer source lineage to the exact
 * process-owned target, checked candidate, and atomically inserted attempt.
 * This object is process provenance only and is consumed immediately before
 * the one permitted local POST.
 */
export function createSubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1(
  input: Readonly<{
    readonly requestBinding:
      Readonly<SubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1>;
    readonly relayerLineage:
      Readonly<SubstrateFederatedIsolatedDevnetPacketRelayerLineageV1>;
    readonly target:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2>;
    readonly executionCheck:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1>;
    readonly authorization:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1>;
    readonly journal:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportJournalV1>;
    readonly attempt:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1>;
  }>,
): Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1> {
  assertSubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1(
    input.authorization,
    input.target,
    input.executionCheck,
  );
  const material = requireDurableAttempt(input.journal, input.attempt);
  const journalMaterial = JOURNALS.get(input.journal)!;
  if (
    material.authorization !== input.authorization
    || PREFLIGHTED_DURABLE_ATTEMPTS.has(input.attempt.durableArtifact)
    || CLAIMED_DURABLE_ATTEMPTS.has(input.attempt.durableArtifact)
  ) {
    throw new Error(
      'tracker transport durable attempt is not eligible for a fresh preflight',
    );
  }
  const persisted = journalMaterial.state
    .getSubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1(
      input.authorization.reservationIdentityHex,
    );
  if (persisted === null || persisted.status !== 'pending') {
    throw new Error(
      'tracker transport preflight requires one pending durable attempt',
    );
  }
  assertPersistedAttemptMatchesAuthorization(persisted, input.authorization);
  if (
    persisted.durableAttemptDigestHex !== input.attempt.durableAttemptDigestHex
    || input.authorization.expectedTransactionIdHex
      !== input.attempt.expectedTransactionIdHex
  ) {
    throw new Error('tracker transport preflight attempt binding changed');
  }
  const requestSha256Hex =
    projectSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingDigestV1(
      input.requestBinding,
    );
  assertSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1(
    input.relayerLineage,
  );
  const consumedRequestSha256Hex =
    consumeSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1(
      input.requestBinding,
    );
  const relayerLineage =
    consumeSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1(
      input.relayerLineage,
    );
  if (consumedRequestSha256Hex !== requestSha256Hex) {
    throw new Error('tracker transport request binding changed');
  }

  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_PREFLIGHT_V1_SCHEMA,
    version: 1 as const,
    status: 'fresh_campaign_bound_before_one_local_post' as const,
    headCommitSha1Hex: fixedCommitSha1(
      relayerLineage.headCommitSha1Hex,
      'tracker transport preflight HEAD commit',
    ),
    requestSha256Hex: fixedHex32(
      requestSha256Hex,
      'tracker transport preflight request digest',
    ),
    relayerArtifactSetDigestHex: fixedHex32(
      relayerLineage.relayerArtifactSetDigestHex,
      'tracker transport preflight relayer artifact-set digest',
    ),
    packetReceiptDigestHex: fixedHex32(
      relayerLineage.packetReceiptDigestHex,
      'tracker transport preflight packet receipt digest',
    ),
    reservationIdentityHex: input.authorization.reservationIdentityHex,
    persistenceStoreIdentityHex: fixedHex32(
      journalMaterial.persistenceStoreIdentityHex,
      'tracker transport preflight persistence-store identity',
    ),
    executionTargetIdentityDigestHex:
      input.authorization.executionTargetIdentityDigestHex,
    expectedTransactionIdHex: input.authorization.expectedTransactionIdHex,
    durableAttemptDigestHex: input.attempt.durableAttemptDigestHex,
    authorizationDigestHex: input.authorization.authorizationDigestHex,
    checks: Object.freeze({
      exactHeadAndRequestBound: true as const,
      exactRelayerPacketLineageBound: true as const,
      exactTargetAndCandidateBound: true as const,
      exactDurableAttemptObservedPending: true as const,
      absentPriorAttemptEstablishedByAtomicInsert: true as const,
      singleUseAuthorizationBound: true as const,
    }),
    boundaries: Object.freeze({
      localIsolatedDevnetOnly: true as const,
      transportPerformed: false as const,
      trackerAdmissionEstablished: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  });
  const preflight = Object.freeze({
    ...body,
    preflightDigestHex: sha256CanonicalJson(body, PREFLIGHT_DIGEST_DOMAIN),
  });
  PREFLIGHTED_DURABLE_ATTEMPTS.add(input.attempt.durableArtifact);
  TRANSPORT_PREFLIGHTS.set(preflight, Object.freeze({
    target: input.target,
    executionCheck: input.executionCheck,
    authorization: input.authorization,
    journal: input.journal,
    attempt: input.attempt,
    preflightDigestHex: preflight.preflightDigestHex,
  }));
  return preflight;
}

export function consumeSubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1(
  preflight:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1>,
  input: Readonly<{
    readonly target:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2>;
    readonly executionCheck:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1>;
    readonly authorization:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1>;
    readonly journal:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportJournalV1>;
    readonly attempt:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1>;
  }>,
): void {
  if (
    preflight === null
    || typeof preflight !== 'object'
    || !Object.isFrozen(preflight)
    || CONSUMED_PREFLIGHTS.has(preflight)
  ) {
    throw new Error(
      'tracker transport preflight lacks fresh process provenance',
    );
  }
  const material = TRANSPORT_PREFLIGHTS.get(preflight);
  const { preflightDigestHex, ...body } = preflight;
  if (
    material === undefined
    || material.target !== input.target
    || material.executionCheck !== input.executionCheck
    || material.authorization !== input.authorization
    || material.journal !== input.journal
    || material.attempt !== input.attempt
    || material.preflightDigestHex !== preflightDigestHex
    || preflight.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_PREFLIGHT_V1_SCHEMA
    || preflight.version !== 1
    || preflight.status !== 'fresh_campaign_bound_before_one_local_post'
    || preflight.executionTargetIdentityDigestHex
      !== input.authorization.executionTargetIdentityDigestHex
    || preflight.expectedTransactionIdHex
      !== input.authorization.expectedTransactionIdHex
    || preflight.durableAttemptDigestHex
      !== input.attempt.durableAttemptDigestHex
    || preflight.authorizationDigestHex
      !== input.authorization.authorizationDigestHex
    || sha256CanonicalJson(body, PREFLIGHT_DIGEST_DOMAIN)
      !== preflightDigestHex
  ) {
    throw new Error('tracker transport preflight binding changed');
  }
  const journalMaterial = JOURNALS.get(input.journal);
  const persisted = journalMaterial?.state
    .getSubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1(
      input.authorization.reservationIdentityHex,
    );
  if (
    journalMaterial === undefined
    || !CLAIMED_DURABLE_ATTEMPTS.has(input.attempt.durableArtifact)
    || preflight.persistenceStoreIdentityHex
      !== journalMaterial.persistenceStoreIdentityHex
    || persisted === null
    || persisted === undefined
    || persisted.status !== 'pending'
  ) {
    throw new Error('tracker transport preflight durable state changed');
  }
  assertPersistedAttemptMatchesAuthorization(persisted, input.authorization);
  CONSUMED_PREFLIGHTS.add(preflight);
}

/**
 * Issue the opaque result consumed by the journal only after the checked
 * transport has completed its single HTTP invocation.
 */
export function issueSubstrateFederatedIsolatedDevnetTrackerTransportResultV1(
  journal: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportJournalV1>,
  attempt:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1>,
  submission: Readonly<{
    readonly status: 'accepted' | 'ambiguous';
    readonly submittedTransactionIdHex: string | null;
    readonly responseCategory:
      SubstrateFederatedIsolatedDevnetTrackerTransportResponseCategoryV1;
    readonly httpStatus: number | null;
    readonly responseDigestHex: string;
  }>,
): Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportResultV1> {
  const material = requireDurableAttempt(journal, attempt);
  if (!CLAIMED_DURABLE_ATTEMPTS.has(attempt.durableArtifact)) {
    throw new Error('tracker transport durable attempt was not claimed');
  }
  const persisted = JOURNALS.get(journal)!.state
    .getSubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1(
      material.authorization.reservationIdentityHex,
    );
  if (persisted === null || persisted.status !== 'pending') {
    throw new Error(
      'tracker transport durable attempt is absent or already finalized',
    );
  }
  assertPersistedAttemptMatchesAuthorization(
    persisted,
    material.authorization,
  );
  if (
    !/^[0-9a-f]{64}$/u.test(submission.responseDigestHex)
    || (
      submission.status === 'accepted'
        ? submission.submittedTransactionIdHex
          !== attempt.expectedTransactionIdHex
        : submission.submittedTransactionIdHex !== null
    )
  ) {
    throw new Error('tracker transport result binding changed');
  }
  const responseClassification =
    createSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1({
      status: submission.status,
      responseCategory: submission.responseCategory,
      httpStatus: submission.httpStatus,
      responseDigestHex: submission.responseDigestHex,
    });
  const resultArtifact = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_OUTCOME_V1_SCHEMA,
    expectedTransactionIdHex: attempt.expectedTransactionIdHex,
  });
  const result = Object.freeze({
    status: submission.status,
    submittedTransactionIdHex: submission.submittedTransactionIdHex,
    responseDigestHex: submission.responseDigestHex,
    responseClassification,
    resultArtifact,
  });
  TRANSPORT_RESULTS.set(resultArtifact, Object.freeze({
    journal,
    attempt,
    submission: Object.freeze({
      status: submission.status,
      submittedTransactionIdHex: submission.submittedTransactionIdHex,
      responseDigestHex: submission.responseDigestHex,
      responseClassification,
    }),
  }));
  return result;
}

export function projectSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1(
  outcome: unknown,
): Readonly<
  SubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1
> | null {
  if (outcome === null || typeof outcome !== 'object') return null;
  return OUTCOME_RESPONSE_CLASSIFICATIONS.get(outcome) ?? null;
}

export function claimSubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1(
  journal: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportJournalV1>,
  attempt:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1>,
  authorization:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1>,
): Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1> {
  const material = requireDurableAttempt(journal, attempt);
  if (material.authorization !== authorization) {
    throw new Error('tracker transport durable attempt authorization changed');
  }
  if (CLAIMED_DURABLE_ATTEMPTS.has(attempt.durableArtifact)) {
    throw new Error('tracker transport durable attempt is already claimed');
  }
  const journalMaterial = JOURNALS.get(journal)!;
  const persisted = journalMaterial.state
    .getSubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1(
      authorization.reservationIdentityHex,
    );
  if (persisted === null || persisted.status !== 'pending') {
    throw new Error(
      'tracker transport durable attempt is absent or already finalized',
    );
  }
  assertPersistedAttemptMatchesAuthorization(persisted, authorization);
  CLAIMED_DURABLE_ATTEMPTS.add(attempt.durableArtifact);
  return persisted;
}

function requireDurableAttempt(
  journal: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportJournalV1>,
  attempt:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1>,
): Readonly<{
  readonly journal: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportJournalV1>;
  readonly authorization:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1>;
  readonly persisted:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1>;
}> {
  if (
    JOURNALS.get(journal) === undefined
    || attempt === null
    || typeof attempt !== 'object'
    || !Object.isFrozen(attempt)
  ) {
    throw new Error('tracker transport durable attempt lacks journal provenance');
  }
  const material = DURABLE_ATTEMPTS.get(attempt.durableArtifact);
  if (
    material === undefined
    || material.journal !== journal
    || material.authorization !== attempt.authorization
    || material.persisted.expectedTransactionIdHex
      !== attempt.expectedTransactionIdHex
    || material.persisted.durableAttemptDigestHex
      !== attempt.durableAttemptDigestHex
  ) {
    throw new Error('tracker transport durable attempt binding changed');
  }
  return material;
}

function requireTransportResult(
  journal: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportJournalV1>,
  attempt:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1>,
  result: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportResultV1>,
): Readonly<{
  readonly status: 'accepted' | 'ambiguous';
  readonly submittedTransactionIdHex: string | null;
  readonly responseDigestHex: string;
  readonly responseClassification: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1
  >;
}> {
  if (
    result === null
    || typeof result !== 'object'
    || !Object.isFrozen(result)
  ) {
    throw new Error('tracker transport result lacks exact provenance');
  }
  const material = TRANSPORT_RESULTS.get(result.resultArtifact);
  if (
    material === undefined
    || material.journal !== journal
    || material.attempt !== attempt
    || material.submission.status !== result.status
    || material.submission.submittedTransactionIdHex
      !== result.submittedTransactionIdHex
    || material.submission.responseDigestHex !== result.responseDigestHex
    || material.submission.responseClassification
      !== result.responseClassification
  ) {
    throw new Error('tracker transport result binding changed');
  }
  return material.submission;
}

function assertAuthorizationMatchesReservation(
  authorization:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1>,
  durableReservation:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1>,
): void {
  if (
    AUTHORIZATIONS.get(authorization)?.durableReservation
      !== durableReservation
    || authorization.reservationIdentityHex
      !== durableReservation.reservationIdentityHex
    || authorization.durableReservationDigestHex
      !== durableReservation.durableReservationDigestHex
    || authorization.expectedTransactionIdHex
      !== durableReservation.bindings.unsignedTransactionIdHex
  ) {
    throw new Error(
      'tracker transport authorization differs from its durable reservation',
    );
  }
}

function assertPersistedAttemptMatchesAuthorization(
  attempt: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1>,
  authorization:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1>,
): void {
  if (
    attempt.reservationIdentityHex !== authorization.reservationIdentityHex
    || attempt.durableReservationDigestHex
      !== authorization.durableReservationDigestHex
    || attempt.expectedTransactionIdHex
      !== authorization.expectedTransactionIdHex
    || !sameStrings(attempt.inputBoxIdsHex, authorization.inputBoxIdsHex)
    || attempt.attemptedAtHeight !== authorization.attemptedAtHeight
    || attempt.reservationFreshnessReceiptDigestHex
      !== authorization.reservationFreshnessReceiptDigestHex
    || attempt.processBindingDigestHex !== authorization.processBindingDigestHex
    || attempt.executionTargetIdentityDigestHex
      !== authorization.executionTargetIdentityDigestHex
    || attempt.signedTransactionDigestHex
      !== authorization.signedTransactionDigestHex
    || attempt.signedTransactionBytesSha256Hex
      !== authorization.signedTransactionBytesSha256Hex
    || attempt.signedTransactionBytesLength
      !== authorization.signedTransactionBytesLength
    || attempt.checkResponseDigestHex !== authorization.checkResponseDigestHex
    || attempt.authorizationDigestHex !== authorization.authorizationDigestHex
  ) {
    throw new Error(
      'persisted tracker transport attempt differs from its authorization',
    );
  }
}

function fixedHex32(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be canonical 32-byte lowercase hex`);
  }
  return value;
}

function fixedCommitSha1(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error(`${label} must be canonical 20-byte lowercase hex`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function positiveInteger(value: unknown, label: string): number {
  const normalized = nonNegativeInteger(value, label);
  if (normalized === 0) throw new Error(`${label} must be positive`);
  return normalized;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}
