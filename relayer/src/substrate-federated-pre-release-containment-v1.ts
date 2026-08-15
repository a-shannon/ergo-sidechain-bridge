/**
 * FED-4C network-free pre-release containment.
 *
 * This root replays the exact tracker-admission and settlement-packet bindings
 * around fresh source recollection, then emits an unconditional submission
 * denial. It has no injected capability through which signing, submission,
 * transport, broadcast, or hold clearing can occur.
 */

import {
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  holdSubstrateFederatedDaemonLifecycleAfterFailureV1,
  runSubstrateFederatedDaemonLifecycleV1,
  type RunSubstrateFederatedDaemonLifecycleV1Input,
  type SubstrateFederatedDaemonLifecycleFailureStageV1,
  type SubstrateFederatedDaemonLifecycleV1Result,
} from './substrate-federated-daemon-lifecycle-v1.js';
import {
  assertSubstrateFederatedDaemonSourceRevalidationV1Provenance,
  revalidateSubstrateFederatedDaemonSchedulingObservationV1,
  type SubstrateFederatedDaemonSchedulingObservationV1,
  type SubstrateFederatedDaemonSourceRevalidationV1,
} from './substrate-federated-daemon-scheduling-v1.js';
import type {
  AuthenticatedSettlementCandidateRevalidationView,
} from './relayer-core/authenticated-settlement-candidate-reconciliation.js';

export const SUBSTRATE_FEDERATED_PRE_RELEASE_CONTAINMENT_V1_SCHEMA =
  'e2s.substrate-federated-pre-release-containment.v1' as const;
export const SUBSTRATE_FEDERATED_TRACKER_ADMISSION_BOUNDARY_V1_SCHEMA =
  'e2s.substrate-federated-tracker-admission-boundary.v1' as const;
export const SUBSTRATE_FEDERATED_CHECK_BOUNDARY_V1_SCHEMA =
  'e2s.substrate-federated-check-boundary.v1' as const;
export const SUBSTRATE_FEDERATED_SUBMISSION_DENIAL_V1_SCHEMA =
  'e2s.substrate-federated-submission-denial.v1' as const;

const TRACKER_ADMISSION_BOUNDARY_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_TRACKER_ADMISSION_BOUNDARY_V1';
const CHECK_BOUNDARY_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_CHECK_BOUNDARY_V1';
const SUBMISSION_DENIAL_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_SUBMISSION_DENIAL_V1';

export interface SubstrateFederatedTrackerAdmissionBoundaryV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_TRACKER_ADMISSION_BOUNDARY_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'tracker_admission_replayed_non_authorizing';
  readonly burnCandidateId: string;
  readonly checkpointProfileIdHex: string;
  readonly checkpointStatementIdHex: string;
  readonly trackerKeyHex: string;
  readonly trackerValueHex: string;
  readonly trackerInputDigestHex: string;
  readonly sourceRevalidationReceiptDigestHex: string;
  readonly receiptDigestHex: string;
  readonly boundary: {
    readonly trackerAdmissionTransactionBuilt: false;
    readonly trackerAdmissionAuthorized: false;
    readonly authorityJournalTransitioned: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
  };
}

export interface SubstrateFederatedCheckBoundaryV1 {
  readonly schema: typeof SUBSTRATE_FEDERATED_CHECK_BOUNDARY_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'settlement_packet_replayed_non_authorizing';
  readonly burnCandidateId: string;
  readonly settlementTransactionIdHex: string;
  readonly settlementTransactionDigestHex: string;
  readonly trackerAdmissionReceiptDigestHex: string;
  readonly sourceRevalidationReceiptDigestHex: string;
  readonly receiptDigestHex: string;
  readonly boundary: {
    readonly localPacketProvenanceVerified: true;
    readonly targetNodeCheckPerformed: false;
    readonly checkPassed: false;
    readonly authorityJournalTransitioned: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
  };
}

export interface SubstrateFederatedSubmissionDenialV1 {
  readonly schema: typeof SUBSTRATE_FEDERATED_SUBMISSION_DENIAL_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'submission_denied_pre_release';
  readonly burnCandidateId: string;
  readonly settlementTransactionIdHex: string;
  readonly checkBoundaryReceiptDigestHex: string;
  readonly sourceRevalidationReceiptDigestHex: string;
  readonly denialDigestHex: string;
  readonly boundary: {
    readonly targetNodeCheckRequiredBeforeAuthorization: true;
    readonly targetNodeCheckPassed: false;
    readonly authorityJournalTransitioned: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
  };
}

export type SubstrateFederatedPreReleaseContainmentV1Result =
  | SubstrateFederatedDaemonLifecycleV1Result
  | Readonly<{
      readonly schema:
        typeof SUBSTRATE_FEDERATED_PRE_RELEASE_CONTAINMENT_V1_SCHEMA;
      readonly version: 1;
      readonly status: 'contained_non_authorizing';
      readonly observation:
        Readonly<SubstrateFederatedDaemonSchedulingObservationV1>;
      readonly revalidations: {
        readonly beforeTrackerAdmission:
          Readonly<SubstrateFederatedDaemonSourceRevalidationV1>;
        readonly afterTrackerAdmission:
          Readonly<SubstrateFederatedDaemonSourceRevalidationV1>;
        readonly afterCheck:
          Readonly<SubstrateFederatedDaemonSourceRevalidationV1>;
        readonly afterSubmissionDenial:
          Readonly<SubstrateFederatedDaemonSourceRevalidationV1>;
      };
      readonly trackerAdmission:
        Readonly<SubstrateFederatedTrackerAdmissionBoundaryV1>;
      readonly check: Readonly<SubstrateFederatedCheckBoundaryV1>;
      readonly submissionDenial:
        Readonly<SubstrateFederatedSubmissionDenialV1>;
      readonly boundary: {
        readonly originalProducerPortsReusedAtEveryBoundary: true;
        readonly trackerAdmissionTransactionBuilt: false;
        readonly targetNodeCheckPerformed: false;
        readonly authorityJournalTransitioned: false;
        readonly signingAuthorized: false;
        readonly submissionAuthorized: false;
        readonly broadcastAuthorized: false;
        readonly fundsAuthorityEstablished: false;
      };
    }>;

export async function runSubstrateFederatedPreReleaseContainmentV1<
  Revalidation extends AuthenticatedSettlementCandidateRevalidationView,
>(
  input: RunSubstrateFederatedDaemonLifecycleV1Input<Revalidation>,
): Promise<Readonly<SubstrateFederatedPreReleaseContainmentV1Result>> {
  const lifecycle = await runSubstrateFederatedDaemonLifecycleV1(input);
  if (lifecycle.status !== 'scheduled_non_authorizing') return lifecycle;
  const observation = lifecycle.observation;
  let currentStage:
    SubstrateFederatedDaemonLifecycleFailureStageV1 =
      'pre_tracker_admission_revalidation';

  try {
    const beforeTrackerAdmission =
      await revalidateSubstrateFederatedDaemonSchedulingObservationV1(
        observation,
      );
    currentStage = 'tracker_admission';
    const trackerAdmission = trackerAdmissionBoundary(
      beforeTrackerAdmission,
    );

    currentStage = 'post_tracker_admission_revalidation';
    const afterTrackerAdmission =
      await revalidateSubstrateFederatedDaemonSchedulingObservationV1(
        observation,
      );
    assertSameScheduledWork(beforeTrackerAdmission, afterTrackerAdmission);
    currentStage = 'checker';
    const check = checkBoundary(afterTrackerAdmission, trackerAdmission);

    currentStage = 'post_check_revalidation';
    const afterCheck =
      await revalidateSubstrateFederatedDaemonSchedulingObservationV1(
        observation,
      );
    assertSameScheduledWork(afterTrackerAdmission, afterCheck);
    currentStage = 'submission_authorization';
    const submissionDenial = submissionDenialBoundary(afterCheck, check);

    currentStage = 'post_submission_authorization_revalidation';
    const afterSubmissionDenial =
      await revalidateSubstrateFederatedDaemonSchedulingObservationV1(
        observation,
      );
    assertSameScheduledWork(afterCheck, afterSubmissionDenial);

    return deepFreeze({
      schema: SUBSTRATE_FEDERATED_PRE_RELEASE_CONTAINMENT_V1_SCHEMA,
      version: 1 as const,
      status: 'contained_non_authorizing' as const,
      observation,
      revalidations: {
        beforeTrackerAdmission,
        afterTrackerAdmission,
        afterCheck,
        afterSubmissionDenial,
      },
      trackerAdmission,
      check,
      submissionDenial,
      boundary: {
        originalProducerPortsReusedAtEveryBoundary: true as const,
        trackerAdmissionTransactionBuilt: false as const,
        targetNodeCheckPerformed: false as const,
        authorityJournalTransitioned: false as const,
        signingAuthorized: false as const,
        submissionAuthorized: false as const,
        broadcastAuthorized: false as const,
        fundsAuthorityEstablished: false as const,
      },
    });
  } catch (error) {
    return holdSubstrateFederatedDaemonLifecycleAfterFailureV1(
      input.incidents,
      currentStage,
      error,
    );
  }
}

function trackerAdmissionBoundary(
  source: Readonly<SubstrateFederatedDaemonSourceRevalidationV1>,
): Readonly<SubstrateFederatedTrackerAdmissionBoundaryV1> {
  assertSubstrateFederatedDaemonSourceRevalidationV1Provenance(source);
  const binding = {
    burnCandidateId: source.burnCandidateId,
    checkpointProfileIdHex: source.checkpointProfileIdHex,
    checkpointStatementIdHex: source.checkpointStatementIdHex,
    trackerKeyHex: source.trackerKeyHex,
    trackerValueHex: source.trackerValueHex,
    trackerInputDigestHex: source.trackerInputDigestHex,
    sourceRevalidationReceiptDigestHex: source.receiptDigestHex,
  };
  return deepFreeze({
    schema: SUBSTRATE_FEDERATED_TRACKER_ADMISSION_BOUNDARY_V1_SCHEMA,
    version: 1 as const,
    status: 'tracker_admission_replayed_non_authorizing' as const,
    ...binding,
    receiptDigestHex: sha256CanonicalJson(
      binding,
      TRACKER_ADMISSION_BOUNDARY_DOMAIN,
    ),
    boundary: falseTrackerBoundary(),
  });
}

function checkBoundary(
  source: Readonly<SubstrateFederatedDaemonSourceRevalidationV1>,
  tracker: Readonly<SubstrateFederatedTrackerAdmissionBoundaryV1>,
): Readonly<SubstrateFederatedCheckBoundaryV1> {
  assertSubstrateFederatedDaemonSourceRevalidationV1Provenance(source);
  if (
    source.burnCandidateId !== tracker.burnCandidateId
    || source.trackerKeyHex !== tracker.trackerKeyHex
    || source.trackerValueHex !== tracker.trackerValueHex
    || source.trackerInputDigestHex !== tracker.trackerInputDigestHex
  ) {
    throw new Error('federated check boundary differs from tracker admission');
  }
  const binding = {
    burnCandidateId: source.burnCandidateId,
    settlementTransactionIdHex: source.settlementTransactionIdHex,
    settlementTransactionDigestHex: source.settlementTransactionDigestHex,
    trackerAdmissionReceiptDigestHex: tracker.receiptDigestHex,
    sourceRevalidationReceiptDigestHex: source.receiptDigestHex,
  };
  return deepFreeze({
    schema: SUBSTRATE_FEDERATED_CHECK_BOUNDARY_V1_SCHEMA,
    version: 1 as const,
    status: 'settlement_packet_replayed_non_authorizing' as const,
    ...binding,
    receiptDigestHex: sha256CanonicalJson(binding, CHECK_BOUNDARY_DOMAIN),
    boundary: {
      localPacketProvenanceVerified: true as const,
      targetNodeCheckPerformed: false as const,
      checkPassed: false as const,
      authorityJournalTransitioned: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
    },
  });
}

function submissionDenialBoundary(
  source: Readonly<SubstrateFederatedDaemonSourceRevalidationV1>,
  check: Readonly<SubstrateFederatedCheckBoundaryV1>,
): Readonly<SubstrateFederatedSubmissionDenialV1> {
  assertSubstrateFederatedDaemonSourceRevalidationV1Provenance(source);
  if (
    source.burnCandidateId !== check.burnCandidateId
    || source.settlementTransactionIdHex !== check.settlementTransactionIdHex
  ) {
    throw new Error('federated submission denial differs from checked packet');
  }
  const binding = {
    burnCandidateId: source.burnCandidateId,
    settlementTransactionIdHex: source.settlementTransactionIdHex,
    checkBoundaryReceiptDigestHex: check.receiptDigestHex,
    sourceRevalidationReceiptDigestHex: source.receiptDigestHex,
    targetNodeCheckRequiredBeforeAuthorization: true as const,
    targetNodeCheckPassed: false as const,
    submissionAuthorized: false as const,
  };
  return deepFreeze({
    schema: SUBSTRATE_FEDERATED_SUBMISSION_DENIAL_V1_SCHEMA,
    version: 1 as const,
    status: 'submission_denied_pre_release' as const,
    burnCandidateId: binding.burnCandidateId,
    settlementTransactionIdHex: binding.settlementTransactionIdHex,
    checkBoundaryReceiptDigestHex: binding.checkBoundaryReceiptDigestHex,
    sourceRevalidationReceiptDigestHex:
      binding.sourceRevalidationReceiptDigestHex,
    denialDigestHex: sha256CanonicalJson(binding, SUBMISSION_DENIAL_DOMAIN),
    boundary: {
      targetNodeCheckRequiredBeforeAuthorization: true as const,
      targetNodeCheckPassed: false as const,
      authorityJournalTransitioned: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
    },
  });
}

function assertSameScheduledWork(
  left: Readonly<SubstrateFederatedDaemonSourceRevalidationV1>,
  right: Readonly<SubstrateFederatedDaemonSourceRevalidationV1>,
): void {
  assertSubstrateFederatedDaemonSourceRevalidationV1Provenance(left);
  assertSubstrateFederatedDaemonSourceRevalidationV1Provenance(right);
  const fields = [
    'profileIdHex',
    'familyIdHex',
    'mintCandidateId',
    'burnCandidateId',
    'settlementTransactionIdHex',
    'settlementTransactionDigestHex',
    'checkpointProfileIdHex',
    'checkpointStatementIdHex',
    'trackerKeyHex',
    'trackerValueHex',
    'trackerInputDigestHex',
    'sourceGenerationRevalidationDigestHex',
    'settlementPredecessorObservationDigestHex',
    'burnRevalidationDigestHex',
    'currentInputRevalidationDigestHex',
  ] as const;
  for (const field of fields) {
    if (left[field] !== right[field]) {
      throw new Error(`federated pre-release ${field} changed between stages`);
    }
  }
}

function falseTrackerBoundary() {
  return Object.freeze({
    trackerAdmissionTransactionBuilt: false as const,
    trackerAdmissionAuthorized: false as const,
    authorityJournalTransitioned: false as const,
    signingAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
    fundsAuthorityEstablished: false as const,
  });
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
